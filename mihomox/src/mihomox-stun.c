#define _POSIX_C_SOURCE 200809L

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#define STUN_COOKIE 0x2112A442u
#define STUN_BINDING_REQUEST 0x0001u
#define STUN_BINDING_RESPONSE 0x0101u
#define STUN_ATTR_CHANGE_REQUEST 0x0003u
#define STUN_ATTR_CHANGED_ADDRESS 0x0005u
#define STUN_ATTR_XOR_MAPPED_ADDRESS 0x0020u
#define STUN_ATTR_OTHER_ADDRESS 0x802cu
#define STUN_TIMEOUT_MS 2500

struct endpoint {
    struct in_addr addr;
    uint16_t port;
    int valid;
};

struct stun_result {
    struct endpoint mapped;
    struct endpoint other;
    int latency_ms;
};

static uint16_t read_u16(const uint8_t *p) {
    return (uint16_t)((uint16_t)p[0] << 8 | p[1]);
}

static uint32_t read_u32(const uint8_t *p) {
    return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 |
           (uint32_t)p[2] << 8 | p[3];
}

static void write_u16(uint8_t *p, uint16_t value) {
    p[0] = (uint8_t)(value >> 8);
    p[1] = (uint8_t)value;
}

static void write_u32(uint8_t *p, uint32_t value) {
    p[0] = (uint8_t)(value >> 24);
    p[1] = (uint8_t)(value >> 16);
    p[2] = (uint8_t)(value >> 8);
    p[3] = (uint8_t)value;
}

static int64_t monotonic_ms(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0)
        return 0;
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void random_bytes(uint8_t *buffer, size_t length) {
    int fd = open("/dev/urandom", O_RDONLY | O_CLOEXEC);
    ssize_t offset = 0;
    if (fd >= 0) {
        while ((size_t)offset < length) {
            ssize_t n = read(fd, buffer + offset, length - (size_t)offset);
            if (n <= 0)
                break;
            offset += n;
        }
        close(fd);
    }
    if ((size_t)offset < length) {
        srand((unsigned int)(time(NULL) ^ getpid()));
        while ((size_t)offset < length)
            buffer[offset++] = (uint8_t)rand();
    }
}

static int resolve_ipv4(const char *host, const char *service,
                        struct sockaddr_in *address) {
    struct addrinfo hints;
    struct addrinfo *result = NULL;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_DGRAM;
    if (getaddrinfo(host, service, &hints, &result) != 0 || !result)
        return -1;
    memcpy(address, result->ai_addr, sizeof(*address));
    freeaddrinfo(result);
    return 0;
}

static int parse_address(const uint8_t *value, size_t length, int xored,
                         struct endpoint *endpoint) {
    uint32_t addr;
    uint16_t port;
    if (length < 8 || value[1] != 0x01)
        return -1;
    port = read_u16(value + 2);
    addr = read_u32(value + 4);
    if (xored) {
        port ^= (uint16_t)(STUN_COOKIE >> 16);
        addr ^= STUN_COOKIE;
    }
    endpoint->port = port;
    endpoint->addr.s_addr = htonl(addr);
    endpoint->valid = 1;
    return 0;
}

static int parse_response(const uint8_t *packet, size_t length,
                          const uint8_t transaction[12],
                          struct stun_result *result) {
    size_t offset;
    size_t message_length;
    if (length < 20 || read_u16(packet) != STUN_BINDING_RESPONSE ||
        read_u32(packet + 4) != STUN_COOKIE ||
        memcmp(packet + 8, transaction, 12) != 0)
        return -1;
    message_length = read_u16(packet + 2);
    if (message_length > length - 20)
        return -1;
    for (offset = 20; offset + 4 <= 20 + message_length;) {
        uint16_t type = read_u16(packet + offset);
        uint16_t attr_length = read_u16(packet + offset + 2);
        const uint8_t *value = packet + offset + 4;
        if (offset + 4u + attr_length > 20u + message_length)
            return -1;
        if (type == STUN_ATTR_XOR_MAPPED_ADDRESS)
            parse_address(value, attr_length, 1, &result->mapped);
        else if (type == STUN_ATTR_CHANGED_ADDRESS || type == STUN_ATTR_OTHER_ADDRESS)
            parse_address(value, attr_length, 0, &result->other);
        offset += 4u + ((attr_length + 3u) & ~3u);
    }
    return result->mapped.valid ? 0 : -1;
}

static int stun_query(int socket_fd, const struct sockaddr_in *server,
                      uint32_t change_flags, struct stun_result *result) {
    uint8_t request[28];
    uint8_t response[2048];
    uint8_t transaction[12];
    size_t request_length = change_flags ? sizeof(request) : 20;
    int64_t started;
    struct pollfd poll_fd;
    ssize_t received;

    memset(result, 0, sizeof(*result));
    memset(request, 0, sizeof(request));
    random_bytes(transaction, sizeof(transaction));
    write_u16(request, STUN_BINDING_REQUEST);
    write_u16(request + 2, change_flags ? 8 : 0);
    write_u32(request + 4, STUN_COOKIE);
    memcpy(request + 8, transaction, sizeof(transaction));
    if (change_flags) {
        write_u16(request + 20, STUN_ATTR_CHANGE_REQUEST);
        write_u16(request + 22, 4);
        write_u32(request + 24, change_flags);
    }

    started = monotonic_ms();
    if (sendto(socket_fd, request, request_length, 0,
               (const struct sockaddr *)server, sizeof(*server)) < 0)
        return -1;

    poll_fd.fd = socket_fd;
    poll_fd.events = POLLIN;
    while (poll(&poll_fd, 1, STUN_TIMEOUT_MS) > 0) {
        received = recvfrom(socket_fd, response, sizeof(response), 0, NULL, NULL);
        if (received < 0)
            return -1;
        if (parse_response(response, (size_t)received, transaction, result) == 0) {
            result->latency_ms = (int)(monotonic_ms() - started);
            return 0;
        }
    }
    return -1;
}

static int endpoint_equal(const struct endpoint *a, const struct endpoint *b) {
    return a->valid && b->valid && a->port == b->port &&
           a->addr.s_addr == b->addr.s_addr;
}

static void endpoint_string(const struct endpoint *endpoint, char *buffer,
                            size_t length) {
    char address[INET_ADDRSTRLEN] = "";
    if (!endpoint->valid ||
        !inet_ntop(AF_INET, &endpoint->addr, address, sizeof(address))) {
        if (length > 0)
            buffer[0] = '\0';
        return;
    }
    snprintf(buffer, length, "%s:%u", address, endpoint->port);
}

static int self_test(void) {
    uint8_t packet[32] = {0};
    uint8_t transaction[12] = {0};
    struct stun_result result;
    write_u16(packet, STUN_BINDING_RESPONSE);
    write_u16(packet + 2, 12);
    write_u32(packet + 4, STUN_COOKIE);
    memcpy(packet + 8, transaction, sizeof(transaction));
    write_u16(packet + 20, STUN_ATTR_XOR_MAPPED_ADDRESS);
    write_u16(packet + 22, 8);
    packet[25] = 1;
    write_u16(packet + 26, (uint16_t)(54321 ^ (STUN_COOKIE >> 16)));
    write_u32(packet + 28, 0xcb007109u ^ STUN_COOKIE);
    memset(&result, 0, sizeof(result));
    if (parse_response(packet, sizeof(packet), transaction, &result) != 0 ||
        result.mapped.port != 54321 || ntohl(result.mapped.addr.s_addr) != 0xcb007109u)
        return 1;
    puts("{\"success\":true}");
    return 0;
}

int main(int argc, char **argv) {
    struct sockaddr_in primary;
    struct sockaddr_in secondary;
    struct sockaddr_in other;
    struct stun_result first;
    struct stun_result second;
    struct stun_result changed;
    struct stun_result alternate;
    struct stun_result changed_port;
    const char *type = "Unknown";
    char mapped[64];
    int socket_fd;

    if (argc == 2 && strcmp(argv[1], "--self-test") == 0)
        return self_test();
    if (resolve_ipv4("stun.cloudflare.com", "3478", &primary) != 0 ||
        resolve_ipv4("stun.l.google.com", "19302", &secondary) != 0) {
        puts("{\"success\":false,\"type\":\"Unknown\",\"error\":\"resolve_failed\"}");
        return 0;
    }
    socket_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (socket_fd < 0) {
        puts("{\"success\":false,\"type\":\"Unknown\",\"error\":\"socket_failed\"}");
        return 0;
    }
    fcntl(socket_fd, F_SETFD, FD_CLOEXEC);
    if (stun_query(socket_fd, &primary, 0, &first) != 0 ||
        stun_query(socket_fd, &secondary, 0, &second) != 0) {
        close(socket_fd);
        puts("{\"success\":false,\"type\":\"Unknown\",\"error\":\"timeout\"}");
        return 0;
    }

    if (!endpoint_equal(&first.mapped, &second.mapped)) {
        type = "Symmetric NAT";
    } else if (!first.other.valid) {
        type = "Cone/Restricted";
    } else if (stun_query(socket_fd, &primary, 0x00000006u, &changed) == 0) {
        type = "Full Cone";
    } else {
        memset(&other, 0, sizeof(other));
        other.sin_family = AF_INET;
        other.sin_addr = first.other.addr;
        other.sin_port = htons(first.other.port);
        if (stun_query(socket_fd, &other, 0, &alternate) == 0 &&
            !endpoint_equal(&first.mapped, &alternate.mapped)) {
            type = "Symmetric NAT";
        } else if (stun_query(socket_fd, &primary, 0x00000002u, &changed_port) == 0) {
            type = "Restricted Cone";
        } else {
            type = "Port Restricted Cone";
        }
    }

    endpoint_string(&first.mapped, mapped, sizeof(mapped));
    close(socket_fd);
    printf("{\"success\":true,\"type\":\"%s\",\"mapped\":\"%s\",\"latency\":%d}\n",
           type, mapped, first.latency_ms);
    return 0;
}
