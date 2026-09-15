package auth

import (
	"testing"
	"time"
)

func TestSignParse(t *testing.T) {
	secret := []byte("test-secret")
	tok, err := Sign(secret, 7, "uabcdef", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	c, err := Parse(secret, tok)
	if err != nil {
		t.Fatal(err)
	}
	if c.UserID != 7 || c.UID != "uabcdef" {
		t.Fatalf("%+v", c)
	}
}

func TestParseRejectsTamper(t *testing.T) {
	secret := []byte("test-secret")
	tok, _ := Sign(secret, 1, "u1", time.Hour)
	if _, err := Parse(secret, tok+"x"); err == nil {
		t.Fatal("expected error")
	}
}
