package crypto

import "testing"

func TestEncryptDecrypt(t *testing.T) {
	box, err := New("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	if err != nil {
		t.Fatal(err)
	}
	plain := []byte(`{"chest":96.2,"waist":81.0}`)
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
