package middleware

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type JWTClaims struct {
	UserID       uuid.UUID `json:"user_id"`
	Username     string    `json:"username"`
	IsRefresh    bool      `json:"is_refresh"`
	TokenVersion int       `json:"token_version,omitempty"`
	IsPanicMode  bool      `json:"is_panic_mode,omitempty"`
	jwt.RegisteredClaims
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func GenerateAccessToken(userID uuid.UUID, username string, secret string, expiryMin int) (string, error) {
	return GenerateCustomAccessToken(userID, username, secret, expiryMin, 1, false)
}

func GenerateCustomAccessToken(userID uuid.UUID, username string, secret string, expiryMin int, tokenVersion int, isPanicMode bool) (string, error) {
	claims := JWTClaims{
		UserID:       userID,
		Username:     username,
		IsRefresh:    false,
		TokenVersion: tokenVersion,
		IsPanicMode:  isPanicMode,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(expiryMin) * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "aura",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func GenerateRefreshToken(userID uuid.UUID, secret string, expiryDays int) (string, error) {
	return GenerateCustomRefreshToken(userID, secret, expiryDays, 1)
}

func GenerateCustomRefreshToken(userID uuid.UUID, secret string, expiryDays int, tokenVersion int) (string, error) {
	claims := JWTClaims{
		UserID:       userID,
		IsRefresh:    true,
		TokenVersion: tokenVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(expiryDays) * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "aura",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func ValidateToken(tokenString string, secret string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("beklenmeyen imza algoritması")
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("geçersiz token")
}

func JWTMiddleware(jwtSecret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// 1. Önce HttpOnly Çerezi kontrol et
		tokenStr := c.Cookies("access_token")

		// 2. Çerez yoksa Authorization: Bearer başlığını kontrol et
		if tokenStr == "" {
			authHeader := c.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Oturum açmanız gerekiyor.",
			})
		}

		claims, err := ValidateToken(tokenStr, jwtSecret)
		if err != nil || claims.IsRefresh {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Geçersiz veya süresi dolmuş oturum.",
			})
		}

		c.Locals("user_id", claims.UserID)
		c.Locals("userID", claims.UserID)
		c.Locals("username", claims.Username)
		c.Locals("token_version", claims.TokenVersion)
		c.Locals("is_panic_mode", claims.IsPanicMode)
		return c.Next()
	}
}
