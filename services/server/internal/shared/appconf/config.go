package appconf

import "os"

type Config struct {
	Env            string
	HTTPAddr       string
	PostgresDSN    string
	RedisAddr      string
	AlgoGRPCAddr   string
	MigrationsDir  string
	CryptoKeyHex   string
	JWTSecret      string
}

func Load() Config {
	cryptoKey := getenv("FITME_CRYPTO_KEY", "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff")
	return Config{
		Env:           getenv("FITME_ENV", "dev"),
		HTTPAddr:      getenv("FITME_HTTP_ADDR", ":8080"),
		PostgresDSN:   getenv("FITME_POSTGRES_DSN", "postgres://fitme:fitme@127.0.0.1:5432/fitme?sslmode=disable"),
		RedisAddr:     getenv("FITME_REDIS_ADDR", "127.0.0.1:6379"),
		AlgoGRPCAddr:  getenv("FITME_ALGO_GRPC_ADDR", "127.0.0.1:19090"),
		MigrationsDir: getenv("FITME_MIGRATIONS_DIR", "./migrations"),
		CryptoKeyHex:  cryptoKey,
		JWTSecret:     getenv("FITME_JWT_SECRET", cryptoKey),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
