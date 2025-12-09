# HorseVPN Security Documentation

## Overview

This document outlines the security measures implemented in HorseVPN to protect against impersonation, Man-in-the-Middle (MITM) attacks, and other security threats.

## Security Features Implemented

### 1. Transport Layer Security (TLS/HTTPS)

**Routing Server:**
- HTTPS support with automatic fallback to HTTP
- Configurable via `USE_HTTPS=true` environment variable
- SSL certificate paths configurable via `SSL_CERT_PATH` and `SSL_KEY_PATH`
- TLS 1.2 minimum with secure cipher suites

**Sync Server:**
- HTTPS support with automatic fallback to HTTP
- Same SSL configuration as routing server

**VPN Server (Go):**
- TLS support via `USE_TLS=true` environment variable
- Certificate files via `TLS_CERT_FILE` and `TLS_KEY_FILE`
- Secure TLS configuration with modern cipher suites
- HTTP security timeouts (ReadTimeout, WriteTimeout, IdleTimeout)

### 2. Authentication and Authorization

**Server Authentication:**
- Sync server authentication for routing server updates
- Bearer token authentication via `SYNC_SERVER_TOKEN` environment variable
- Token validation on sensitive endpoints

**Input Validation:**
- Strict validation of server registration data
- URL format validation for WebSocket endpoints
- Server ID format validation (alphanumeric + dash/underscore only)
- Location string validation

### 3. Rate Limiting and DDoS Protection

**Implemented on all servers:**
- Express rate limiting (100 requests per 15 minutes per IP)
- Strict limiting on sensitive endpoints (10 requests per 15 minutes)
- Different limits for registration endpoints (5 attempts per 15 minutes)

### 4. Security Headers

**Helmet.js middleware on Node.js servers:**
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options, X-Content-Type-Options, etc.

### 5. WebSocket Security

**Origin Validation:**
- Strict origin checking on WebSocket connections
- Configurable trusted domains via `TRUSTED_DOMAINS` environment variable
- Rejects connections without Origin header

**Protocol Enforcement:**
- Enforces `vpn-protocol` subprotocol on WebSocket connections

### 6. Client Security

**Certificate Validation:**
- HTTPS enforcement for API communications
- Certificate validation with warnings for untrusted certificates
- Proper Origin header setting for WebSocket connections

## Configuration

### Environment Variables

#### Routing Server
```bash
PORT=3000
USE_HTTPS=true
SSL_CERT_PATH=./ssl/cert.pem
SSL_KEY_PATH=./ssl/key.pem
SYNC_SERVER_TOKEN=your-secure-token-here
SYNC_SERVER_URL=https://your-sync-server.com/list
```

#### Sync Server
```bash
PORT=3001
USE_HTTPS=true
SSL_CERT_PATH=./ssl/cert.pem
SSL_KEY_PATH=./ssl/key.pem
ROUTING_SERVER_URL=https://your-routing-server.com/update-servers
```

#### VPN Server
```bash
PORT=8080
USE_TLS=true
TLS_CERT_FILE=./ssl/cert.pem
TLS_KEY_FILE=./ssl/key.pem
TRUSTED_DOMAINS=https://your-client-domain.com,https://another-trusted-domain.com
SYNC_SERVER=https://your-sync-server.com
```

### SSL Certificate Setup

1. Generate self-signed certificates for development:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

2. For production, use certificates from a trusted CA (Let's Encrypt, etc.)

3. Place certificates in `./ssl/` directory or configure paths via environment variables

## Security Best Practices

### Deployment

1. **Always use HTTPS/TLS in production**
2. **Use strong, randomly generated tokens** for `SYNC_SERVER_TOKEN`
3. **Restrict trusted domains** in `TRUSTED_DOMAINS` to only necessary origins
4. **Regularly rotate certificates** and tokens
5. **Monitor logs** for security-related events

### Certificate Pinning

For enhanced security, implement certificate pinning:

1. **Extract certificate fingerprints:**
```bash
openssl x509 -in cert.pem -pubkey -noout | openssl rsa -pubin -outform der | openssl dgst -sha256
```

2. **Implement pinning in client code** (see client/lib/main.dart for placeholder)

### Monitoring

Monitor for:
- Failed authentication attempts
- Rate limit violations
- Invalid certificate connections
- Unauthorized origin connections

## Threat Mitigation

### Impersonation Protection
- Server ID validation and uniqueness checking
- Secure ID generation using crypto.randomBytes
- Authentication tokens for server-to-server communication

### MITM Protection
- HTTPS enforcement
- Certificate validation
- Origin header validation
- Protocol enforcement

### DDoS Protection
- Rate limiting on all endpoints
- Request size limits (10MB)
- Timeout configurations

### Data Protection
- Input validation and sanitization
- Secure defaults (fail-closed approach)
- Error handling that doesn't leak sensitive information

## Testing Security

### Automated Testing
- Add security-focused unit tests
- Test certificate validation
- Test rate limiting behavior
- Test input validation

### Manual Testing
- Attempt MITM attacks with tools like mitmproxy
- Test invalid certificate handling
- Verify rate limiting works
- Test authentication failures

## Future Security Enhancements

1. **Mutual TLS (mTLS)** for server-to-server authentication
2. **OAuth2/JWT** for client authentication
3. **Certificate pinning** implementation
4. **Security audit logging**
5. **Automated certificate renewal**
6. **Web Application Firewall (WAF)** integration
7. **Database encryption** for sensitive stored data
8. **API versioning** and deprecation policies
9. **Security headers** for all responses
10. **Content validation** beyond basic input checks

## Compliance

This implementation provides a foundation for compliance with:
- OWASP security guidelines
- Basic security hygiene requirements
- VPN security best practices

## Support

For security-related issues or questions:
- Review server logs for security events
- Check environment variable configuration
- Verify certificate validity and paths
- Ensure all components are using the latest secure versions
