from app.services.content_look import (
    VOLT,
    classify_family,
    default_look,
    director_look_contract,
    infer_content_look,
    look_css_vars,
    tint_accent,
)


def test_warm_indoor_is_ember():
    family, _, _ = classify_family(
        {"luma": 0.42, "sat": 0.28, "warm": 0.14, "contrast": 0.22},
        [{"scene": "Speaker in warm lamp light, beige wall"}],
        "вечерний разговор на кухне",
    )
    assert family == "ember"


def test_dark_neon_is_signal():
    family, _, _ = classify_family(
        {"luma": 0.22, "sat": 0.35, "warm": -0.04, "contrast": 0.3},
        [{"scene": "Dark room RGB neon hoodie monitor"}],
        "разбор AI стартапа",
    )
    assert family == "signal"


def test_white_studio_is_frost():
    family, _, _ = classify_family(
        {"luma": 0.62, "sat": 0.12, "warm": 0.01, "contrast": 0.18},
        [{"scene": "Bright studio white wall daylight"}],
        "короткий урок как объяснить тему",
    )
    assert family == "frost"


def test_infer_without_video_still_returns_family():
    look = infer_content_look(
        scenes=[{"scene": "messy bedroom handheld selfie"}],
        transcript="просто рассказываю как есть дома",
    )
    assert look["family"] in ("raw", "ember", "ink", "frost", "signal")
    assert look["language"] == "optical_cut"
    assert look["palette"]["accent"]
    assert "subtitle_preset" in look["montage"]


def test_director_contract_bans_stock_kits():
    text = director_look_contract(default_look("signal"))
    assert "optical_cut" in text
    assert "#6366F1" in text
    assert "C8F542" in text or VOLT in text


def test_look_css_vars_injected():
    css = look_css_vars(default_look("ember"))
    assert "--look-accent:" in css
    assert "#6366F1" not in css


def test_tint_accent_mixes_toward_footage():
    mixed = tint_accent("#D0602A", "#88AA44")
    assert mixed.startswith("#")
    assert mixed != "#D0602A"


def test_abstract_fallback_uses_look_accent_not_gold():
    from app.workflows.graphics_developer import _abstract_accent_fallback

    look = default_look("signal")
    html = _abstract_accent_fallback("ПОДКЛЮЧИ СЕРВЕР | Готово", 0, 3, "9:16", look=look)
    assert "glass-card" not in html
    assert look["palette"]["accent"] in html
    assert "#FACC15" not in html
    assert "#6366F1" not in html
    assert "abs-tick" in html
    assert "back.out" not in html


def test_title_fallback_uses_field_not_indigo():
    from app.workflows.graphics_developer import _kinetic_title_fallback

    look = default_look("ink")
    html = _kinetic_title_fallback("ДАННЫЕ РЕШАЮТ ВСЁ", 0, 3, "9:16", look=look)
    assert look["palette"]["field"] in html
    assert look["palette"]["accent"] in html
    assert "1e1b4b" not in html
    assert "back.out" not in html


def test_proportional_tokens_include_look():
    from app.workflows.graphics_developer import _proportional_tokens_css

    css = _proportional_tokens_css("9:16", mode="overlay", look=default_look("frost"))
    assert "--look-accent:" in css
    assert "--plate-max-w: 90%" in css
