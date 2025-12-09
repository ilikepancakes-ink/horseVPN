FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git for direct module fetching
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod ./
ENV GOPROXY=direct
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o vpn-server .

FROM alpine:latest

# Install ca-certificates for HTTPS requests
RUN apk add --no-cache ca-certificates

# Copy the binary
COPY --from=builder /app/vpn-server /usr/local/bin/

# Create a non-root user
RUN adduser -D vpnuser
USER vpnuser

EXPOSE 8080

CMD ["vpn-server"]
