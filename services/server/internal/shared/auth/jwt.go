package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Claims struct {
	UserID int64  `json:"user_id"`
	UID    string `json:"uid"`
	Exp    int64  `json:"exp"`
}

func Sign(secret []byte, userID int64, uid string, ttl time.Duration) (string, error) {
	claims := Claims{UserID: userID, UID: uid, Exp: time.Now().Add(ttl).Unix()}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	head := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	body := base64.RawURLEncoding.EncodeToString(payload)
	sig := sign(secret, head+"."+body)
	return head + "." + body + "." + sig, nil
}

func Parse(secret []byte, token string) (Claims, error) {
	var zero Claims
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return zero, errors.New("malformed token")
	}
	if sign(secret, parts[0]+"."+parts[1]) != parts[2] {
		return zero, errors.New("bad signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return zero, err
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return zero, err
	}
	if time.Now().Unix() >= c.Exp {
		return zero, errors.New("expired")
	}
	return c, nil
}

func sign(secret []byte, data string) string {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
