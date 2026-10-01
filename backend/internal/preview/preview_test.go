package preview

import (
	"net"
	"testing"
)

func TestIsPrivateOrReservedIP(t *testing.T) {
	tests := []struct {
		name     string
		ipStr    string
		expected bool
	}{
		{"IPv4 Loopback 127.0.0.1", "127.0.0.1", true},
		{"IPv4 Loopback 127.0.0.2", "127.0.0.2", true},
		{"IPv4 Private 10.0.0.1", "10.0.0.1", true},
		{"IPv4 Private 172.16.0.1", "172.16.0.1", true},
		{"IPv4 Private 172.31.255.255", "172.31.255.255", true},
		{"IPv4 Private 192.168.1.1", "192.168.1.1", true},
		{"Cloud Metadata IP 169.254.169.254", "169.254.169.254", true},
		{"Link-Local 169.254.1.1", "169.254.1.1", true},
		{"This Host 0.0.0.0", "0.0.0.0", true},
		{"Carrier-Grade NAT 100.64.0.1", "100.64.0.1", true},
		{"Multicast 224.0.0.1", "224.0.0.1", true},
		{"IPv6 Loopback ::1", "::1", true},
		{"IPv6 Unique Local fc00::1", "fc00::1", true},
		{"IPv6 Link-Local fe80::1", "fe80::1", true},
		{"Public Cloudflare DNS 1.1.1.1", "1.1.1.1", false},
		{"Public Google DNS 8.8.8.8", "8.8.8.8", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ip := net.ParseIP(tt.ipStr)
			if ip == nil {
				t.Fatalf("Geçersiz test IP'si: %s", tt.ipStr)
			}
			result := IsPrivateOrReservedIP(ip)
			if result != tt.expected {
				t.Errorf("IsPrivateOrReservedIP(%s) = %v; beklenen %v", tt.ipStr, result, tt.expected)
			}
		})
	}
}

func TestValidatePreviewURL(t *testing.T) {
	tests := []struct {
		name      string
		rawURL    string
		shouldErr bool
	}{
		{"Valid HTTPS URL", "https://example.com/page", false},
		{"Valid HTTP URL", "http://example.org/test", false},
		{"Loopback IPv4", "http://127.0.0.1:8080/secret", true},
		{"Loopback Hostname localhost", "http://localhost:3000", true},
		{"Cloud Metadata AWS/GCP", "http://169.254.169.254/latest/meta-data/", true},
		{"Private 10.x", "http://10.0.0.5/admin", true},
		{"Private 192.168.x", "http://192.168.1.100/router", true},
		{"Private 172.16.x", "http://172.16.0.10:8000", true},
		{"Embedded Credentials", "http://admin:pass@example.com", true},
		{"File Scheme", "file:///etc/passwd", true},
		{"FTP Scheme", "ftp://example.com", true},
		{"Gopher Scheme", "gopher://example.com", true},
		{"Empty Hostname", "http:///path", true},
		{"Internal Domain .local", "http://server.local/api", true},
		{"Google Metadata Internal", "http://metadata.google.internal/computeMetadata/v1/", true},
		{"Disallowed Port 6379 Redis", "http://example.com:6379/info", true},
		{"Disallowed Port 5432 Postgres", "http://example.com:5432/db", true},
		{"Disallowed Port 22 SSH", "http://example.com:22/ssh", true},
		{"Allowed Web Port 8080", "http://example.com:8080/test", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ValidatePreviewURL(tt.rawURL)
			if (err != nil) != tt.shouldErr {
				t.Errorf("ValidatePreviewURL(%s) error = %v, shouldErr = %v", tt.rawURL, err, tt.shouldErr)
			}
		})
	}
}
