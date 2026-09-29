package safesize

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"strings"

	"github.com/google/uuid"
)

const (
	policyVersion = "body-data-v1"
	policyText    = "FitMe body_data v1：仅用于开发环境手填身体数据与尺码规则演示。不同意不得写入档案或得到推荐。此记录不能代替生产环境的同意留痕、备份清除和密钥托管。"
	consentUI     = "separate_unchecked_checkbox"
	ruleVersion   = "ease-band-v1"
)

func policyDigest() string {
	sum := sha256.Sum256([]byte(policyText))
	return hex.EncodeToString(sum[:])
}

var policySHA = policyDigest()

// ConsentGrant 只证明请求带上了当前政策摘要和独立勾选动作。
// 没有 IP、设备，也不能证明终端真的展示过未预勾弹窗。
type ConsentGrant struct {
	Scene     string `json:"scene"`
	Version   string `json:"policy_version"`
	Agree     bool   `json:"agree"`
	UIAction  string `json:"ui_action"`
	PolicySHA string `json:"policy_sha256"`
}

func (g ConsentGrant) validate() error {
	if g.Scene != "body_data" || g.Version != policyVersion || !g.Agree || g.UIAction != consentUI || g.PolicySHA != policySHA {
		return invalid
	}
	return nil
}

var invalid = errors.New("invalid request")

type Profile struct {
	ConsentID string             `json:"consent_id"`
	HeightCM  float64            `json:"height_cm"`
	WeightKG  *float64           `json:"weight_kg,omitempty"`
	BodyShape string             `json:"body_shape"`
	Measures  map[string]float64 `json:"measurements_cm,omitempty"`
}

type storedProfile struct {
	UserID int64  `json:"user_id"`
	UID    string `json:"uid"`
	Profile
}

type Size struct {
	Label        string             `json:"label"`
	Measurements map[string]float64 `json:"measurements"`
}

type Chart struct {
	Category     string `json:"category"`
	Unit         string `json:"unit"`
	MeasureMode  string `json:"measure_mode"`
	DeclaredMode string `json:"declared_mode,omitempty"`
	Sizes        []Size `json:"sizes"`
}

type Diagnosis struct {
	Part    string `json:"part"`
	Verdict string `json:"verdict"`
}

type Result struct {
	MainSize    *string     `json:"main_size"`
	Alternative *string     `json:"alternative"`
	Diagnostics []Diagnosis `json:"diagnostics"`
	Uncertainty string      `json:"uncertainty"`
	ChartBasis  string      `json:"chart_basis"`
	RuleVersion string      `json:"rule_version"`
}

func validRange(v, min, max float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= min && v <= max
}

func (p Profile) validate() error {
	if id, err := uuid.Parse(p.ConsentID); err != nil || id.String() != p.ConsentID {
		return invalid
	}
	if !validRange(p.HeightCM, 100, 230) || (p.WeightKG != nil && !validRange(*p.WeightKG, 25, 300)) {
		return invalid
	}
	if p.BodyShape != "standard" && p.BodyShape != "slim" && p.BodyShape != "broad" {
		return invalid
	}
	for k, v := range p.Measures {
		if k != "chest" && k != "waist" && k != "hip" {
			return invalid
		}
		if !validRange(v, 40, 200) {
			return invalid
		}
	}
	return nil
}

func (c Chart) normalized() (Chart, error) {
	if c.Category != "tshirt" && c.Category != "shirt" && c.Category != "pants" {
		return Chart{}, invalid
	}
	if c.Unit != "cm" && c.Unit != "inch" {
		return Chart{}, invalid
	}
	if c.MeasureMode != "flat_half" && c.MeasureMode != "circumference" {
		return Chart{}, invalid
	}
	if len(c.Sizes) == 0 || len(c.Sizes) > 20 {
		return Chart{}, invalid
	}
	factor := 1.0
	if c.Unit == "inch" {
		factor = 2.54
	}
	if c.MeasureMode == "flat_half" {
		factor *= 2
	}
	seen := make(map[string]bool)
	out := Chart{Category: c.Category, Unit: "cm", MeasureMode: "circumference", DeclaredMode: c.MeasureMode}
	for _, size := range c.Sizes {
		if size.Label == "" || len(size.Label) > 16 || strings.TrimSpace(size.Label) != size.Label || seen[size.Label] {
			return Chart{}, invalid
		}
		seen[size.Label] = true
		v := make(map[string]float64, len(size.Measurements))
		for part, n := range size.Measurements {
			if part != "chest" && part != "waist" && part != "hip" {
				return Chart{}, invalid
			}
			if (c.Category == "pants" && part == "chest") || (c.Category != "pants" && part != "chest") {
				return Chart{}, invalid
			}
			n *= factor
			if !validRange(n, 40, 300) {
				return Chart{}, invalid
			}
			v[part] = n
		}
		if c.Category == "pants" && (v["waist"] == 0 || v["hip"] == 0) {
			return Chart{}, invalid
		}
		if c.Category != "pants" && v["chest"] == 0 {
			return Chart{}, invalid
		}
		out.Sizes = append(out.Sizes, Size{Label: size.Label, Measurements: v})
	}
	return out, nil
}

func easeBand(category, part string) (float64, float64, bool) {
	switch category + ":" + part {
	case "tshirt:chest":
		return 8, 22, true
	case "shirt:chest":
		return 6, 16, true
	case "pants:waist":
		return 4, 14, true
	case "pants:hip":
		return 6, 16, true
	default:
		return 0, 0, false
	}
}

func chartBasis(chart Chart) string {
	switch chart.DeclaredMode {
	case "flat_half":
		return "caller_declared_flat_half"
	case "circumference":
		return "caller_declared_circumference"
	default:
		return "caller_declared_unverified"
	}
}

func recommend(p Profile, chart Chart) Result {
	base := Result{Diagnostics: []Diagnosis{}, ChartBasis: chartBasis(chart), RuleVersion: ruleVersion}
	parts := []string{"chest"}
	if chart.Category == "pants" {
		parts = []string{"waist", "hip"}
	}
	for _, part := range parts {
		if p.Measures[part] == 0 {
			base.Uncertainty = "missing_measured_" + part + "; no_size_inferred"
			return base
		}
	}
	// 身高、体重和体型模板不换算成围度。覆盖实测但仍落在品类松量带外时，不给主码。
	eligible := make([]Size, 0, len(chart.Sizes))
	coveredOutside := false
	for _, size := range chart.Sizes {
		covers := true
		inside := true
		for _, part := range parts {
			ease := size.Measurements[part] - p.Measures[part]
			minEase, maxEaseLimit, ok := easeBand(chart.Category, part)
			if ease < 0 {
				covers = false
			}
			if !ok || ease < minEase || ease > maxEaseLimit {
				inside = false
			}
		}
		if covers && inside {
			eligible = append(eligible, size)
		} else if covers {
			coveredOutside = true
		}
	}
	if len(eligible) == 0 {
		base.Uncertainty = "no_size_covers_measured_parts"
		if coveredOutside {
			base.Uncertainty = "outside_category_ease_band; no_reliable_size"
		}
		return base
	}
	for i := 0; i < len(eligible); i++ {
		for j := i + 1; j < len(eligible); j++ {
			if maxEase(eligible[j], p, parts) < maxEase(eligible[i], p, parts) {
				eligible[i], eligible[j] = eligible[j], eligible[i]
			}
		}
	}
	if len(eligible) > 1 && maxEase(eligible[0], p, parts) == maxEase(eligible[1], p, parts) {
		base.Uncertainty = "ambiguous_chart; no_size_selected"
		return base
	}
	main := eligible[0].Label
	base.MainSize = &main
	base.Uncertainty = "limited: category_ease_band_unverified; chart_basis_caller_declared"
	if len(eligible) > 1 {
		alt := eligible[1].Label
		base.Alternative = &alt
	}
	for _, part := range parts {
		base.Diagnostics = append(base.Diagnostics, Diagnosis{Part: part, Verdict: "within_ease_band"})
	}
	return base
}

func maxEase(size Size, p Profile, parts []string) float64 {
	var m float64
	for _, part := range parts {
		if d := size.Measurements[part] - p.Measures[part]; d > m {
			m = d
		}
	}
	return m
}

func encode(v any) ([]byte, error) { return json.Marshal(v) }
