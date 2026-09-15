package crypto

import "testing"

func TestHMACHexStable(t *testing.T) {
	box, err := New("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatal(err)
	}
	a := box.HMACHex("13800138000")
	b := box.HMACHex("13800138000")
	if a != b || len(a) != 64 {
		t.Fatalf("hmac %s", a)
	}
}

func TestEncryptDecrypt(t *testing.T) {
	box, err := New("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatal(err)
	}
	plain := []byte(`{"k":1}`)
	enc, err := box.Encrypt(plain)
	if err != nil {
		t.Fatal(err)
	}
	got, err := box.Decrypt(enc)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(plain) {
		t.Fatalf("got %s", got)
	}
}
