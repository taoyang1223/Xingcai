package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// Box 是围度等敏感字段的唯一加解密入口。业务模块禁止自己实现 AES。
type Box struct {
	key []byte
	gcm cipher.AEAD
}

func New(hexKey string) (*Box, error) {
	raw, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("decode crypto key: %w", err)
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("crypto key must be 32 bytes, got %d", len(raw))
	}
	block, err := aes.NewCipher(raw)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{key: raw, gcm: gcm}, nil
}

// HMACHex 用于手机号查找哈希。禁止把明文手机号写入日志或查询条件以外的存储。
func (b *Box) HMACHex(plain string) string {
	mac := hmac.New(sha256.New, b.key)
	_, _ = mac.Write([]byte(plain))
	return hex.EncodeToString(mac.Sum(nil))
}

func (b *Box) Encrypt(plain []byte) ([]byte, error) {
	nonce := make([]byte, b.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return b.gcm.Seal(nonce, nonce, plain, nil), nil
}

func (b *Box) Decrypt(buf []byte) ([]byte, error) {
	ns := b.gcm.NonceSize()
	if len(buf) < ns {
		return nil, errors.New("ciphertext too short")
	}
	return b.gcm.Open(nil, buf[:ns], buf[ns:], nil)
}
