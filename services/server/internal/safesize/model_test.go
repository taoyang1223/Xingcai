package safesize

import "testing"

func TestProfileValidation(t *testing.T) {
	p := Profile{ConsentID: "3f7f056d-8b0c-4fb2-a513-3387d718ee56", HeightCM: 170, BodyShape: "standard"}
	if err := p.validate(); err != nil {
		t.Fatal(err)
	}
	p.Measures = map[string]float64{"chest": 90}
	if err := p.validate(); err != nil {
		t.Fatal(err)
	}
	p.Measures["chest"] = 0
	if err := p.validate(); err == nil {
		t.Fatal("accepted zero circumference")
	}
	delete(p.Measures, "chest")
	p.ConsentID = ""
	if err := p.validate(); err == nil {
		t.Fatal("accepted missing consent")
	}
}

func TestChartNormalization(t *testing.T) {
	c := Chart{Category: "shirt", Unit: "inch", MeasureMode: "flat_half", Sizes: []Size{{Label: "M", Measurements: map[string]float64{"chest": 20}}}}
	n, err := c.normalized()
	if err != nil {
		t.Fatal(err)
	}
	if n.Sizes[0].Measurements["chest"] != 101.6 || n.Unit != "cm" || n.MeasureMode != "circumference" {
		t.Fatalf("normalization failed: %+v", n)
	}
	c.Sizes[0].Measurements["waist"] = 20
	if _, err := c.normalized(); err == nil {
		t.Fatal("accepted wrong category part")
	}
	c = Chart{Category: "pants", Unit: "cm", MeasureMode: "flat_half", Sizes: []Size{{Label: "M", Measurements: map[string]float64{"waist": 40}}}}
	if _, err := c.normalized(); err == nil {
		t.Fatal("accepted missing hip")
	}
}

func TestRecommendDoesNotInferFromWeakProfile(t *testing.T) {
	p := Profile{HeightCM: 170, BodyShape: "standard"}
	c := Chart{Category: "tshirt", Sizes: []Size{{Label: "M", Measurements: map[string]float64{"chest": 100}}}}
	r := recommend(p, c)
	if r.MainSize != nil || r.Uncertainty != "missing_measured_chest; no_size_inferred" {
		t.Fatalf("weak profile falsely recommended: %+v", r)
	}
}

func TestRecommendOnlyMeasuredCoverage(t *testing.T) {
	p := Profile{Measures: map[string]float64{"waist": 80, "hip": 96}}
	c := Chart{Category: "pants", DeclaredMode: "circumference", Sizes: []Size{
		{Label: "L", Measurements: map[string]float64{"waist": 92, "hip": 108}},
		{Label: "S", Measurements: map[string]float64{"waist": 82, "hip": 100}},
		{Label: "M", Measurements: map[string]float64{"waist": 86, "hip": 104}},
	}}
	r := recommend(p, c)
	if r.MainSize == nil || *r.MainSize != "M" || r.Alternative == nil || *r.Alternative != "L" || len(r.Diagnostics) != 2 || r.Diagnostics[0].Verdict != "within_ease_band" {
		t.Fatalf("unexpected result: %+v", r)
	}
}

func TestTightCoverIsNotARecommendation(t *testing.T) {
	p := Profile{Measures: map[string]float64{"chest": 90}}
	tight := Chart{Category: "tshirt", DeclaredMode: "circumference", Sizes: []Size{{Label: "S", Measurements: map[string]float64{"chest": 94}}}}
	r := recommend(p, tight)
	if r.MainSize != nil || r.Uncertainty != "outside_category_ease_band; no_reliable_size" || r.RuleVersion != ruleVersion {
		t.Fatalf("tight cover still recommended: %+v", r)
	}
	looser := tight
	looser.Sizes = []Size{
		{Label: "S", Measurements: map[string]float64{"chest": 94}},
		{Label: "M", Measurements: map[string]float64{"chest": 102}},
	}
	looser.DeclaredMode = "flat_half"
	r = recommend(p, looser)
	if r.MainSize == nil || *r.MainSize != "M" || r.Alternative != nil || r.ChartBasis != "caller_declared_flat_half" {
		t.Fatalf("ease change did not move recommendation: %+v", r)
	}
}
