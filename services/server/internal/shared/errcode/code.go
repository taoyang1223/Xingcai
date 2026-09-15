package errcode

const (
	OK                  = 0
	BadRequest          = 40001
	Unauthorized        = 40101
	ConsentRequired     = 40301
	Forbidden           = 40302
	NotFound            = 40401
	Conflict            = 40901
	RateLimited         = 42901
	Internal            = 50001
	NotImplemented      = 50002
	MeasureUnavailable  = 50301
	ParseFailed         = 50302
)

func HTTPStatus(code int) int {
	switch code {
	case OK:
		return 200
	case NotImplemented:
		return 501
	default:
		return code / 100
	}
}
