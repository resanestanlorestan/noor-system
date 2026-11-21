#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
الحاقیهٔ ۲.۲۰.۰ — بازطراحی بصری لایهٔ workspace.css
فقط رنگ/شعاع/سایه عوض می‌شود؛ هیچ سلکتور ساختاری یا قانون عملکردی حذف/تغییر نمی‌کند.
هر جایگزینی شمارش‌وری می‌شود تا اگر الگویی پیدا نشود، اسکریپت با خطا متوقف شود.
"""
import sys

PATH = "/home/z/my-project/src/app/workspace.css"

# (old, new, expected_count or None = همهٔ رخدادها)
REPLACEMENTS = [
    # --- جعبهٔ لوگو/برند: سبز/طلایی → گرادیان فیروزه/آبی سرمه‌ای ---
    ("background:#145740; color:#dfcf9f; box-shadow:0 5px 12px #1259431f;",
     "background:linear-gradient(135deg,#0d9488,#1153c4); color:#fff; box-shadow:0 5px 14px rgba(13,148,136,.32);", 1),
    ("border:1px solid #d0bc7b66;", "border:1px solid #7fe0d666;", 1),

    # --- استوری صفحهٔ ورود: سبز → سرمه‌ای + اکسنت فیروزه ---
    (".auth-story { min-height:620px; background:#0e4d3a;",
     ".auth-story { min-height:620px; background:#0f2a52;", 1),
    (".auth-story-art { background-image:url('/images/plan-pattern.png'); background-size:auto 100%; background-position:center left; transform:scaleX(-1); opacity:.42; }",
     ".auth-story-art { background-image:url('/images/plan-pattern.png'); background-size:auto 100%; background-position:center left; transform:scaleX(-1); opacity:.5; filter:grayscale(1) contrast(1.05); }", 1),
    ("background:linear-gradient(145deg,#104d3eeb 5%,#104d3edc 48%,#0c4235a8 100%);",
     "background:linear-gradient(145deg,#0f2a52eb 5%,#0e2c58dc 48%,#0b2144a8 100%);", 1),
    ("border:1px solid #c6e0ca3d;", "border:1px solid #ffffff2e;", 1),
    ("span { width:6px; height:6px; border-radius:50%; background:#d5c28b; }",
     "span { width:6px; height:6px; border-radius:50%; background:#6fe3d6; }", 1),
    ("h1 em { color:#e3d1a1; font-style:normal; }",
     "h1 em { color:#6fe3d6; font-style:normal; }", 1),
    (".auth-story-inner > p { color:#c7dacf;",
     ".auth-story-inner > p { color:#b9cbe8;", 1),
    (".auth-features > div > span { width:40px; height:40px; display:grid; place-items:center; flex:none; border-radius:10px; background:#ffffff13; color:var(--muted-3); border:1px solid #ffffff19; }",
     ".auth-features > div > span { width:40px; height:40px; display:grid; place-items:center; flex:none; border-radius:10px; background:#ffffff13; color:#9fb2cf; border:1px solid #ffffff19; }", 1),
    (".auth-features strong { color:var(--muted-3); font-size:11px; }",
     ".auth-features strong { color:#8ea3c2; font-size:11px; }", 1),
    (".auth-features small { color:var(--muted-3); font-size:10px; margin-top:4px; }",
     ".auth-features small { color:#8ea3c2; font-size:10px; margin-top:4px; }", 1),
    (".auth-story-footer { position:relative; z-index:1; padding:20px 58px 25px; color:#b6cfc0; font-size:10px; }",
     ".auth-story-footer { position:relative; z-index:1; padding:20px 58px 25px; color:#9fb2cf; font-size:10px; }", 1),
    (".auth-story-footer span { padding:0 6px; color:#d6c48b; }",
     ".auth-story-footer span { padding:0 6px; color:#6fe3d6; }", 1),

    # --- هیرو داشبورد: سبز → سرمه‌ای + دکمهٔ گرادیانی ---
    (".ws-hero { min-height:211px; border-radius:13px; overflow:hidden; background:#104c3a; position:relative; color:white; }",
     ".ws-hero { min-height:211px; border-radius:14px; overflow:hidden; background:#0f2a52; position:relative; color:white; }", 1),
    (".ws-hero-art { background:url('/images/plan-pattern.png') center/cover; transform:scaleX(-1); opacity:.68; }",
     ".ws-hero-art { background:url('/images/plan-pattern.png') center/cover; transform:scaleX(-1); opacity:.5; filter:grayscale(1) contrast(1.05); }", 1),
    ("background:linear-gradient(270deg,#104c3a 0%,#104c3af5 32%,#104c3ab0 58%,#104c3a08 100%);",
     "background:linear-gradient(270deg,#0f2a52 0%,#0f2a52f5 32%,#0f2a52b0 58%,#0f2a5208 100%);", 1),
    ("border:1px solid #c4d3b43d; color:#d3dfc7; border-radius:5px; font-size:9px; }",
     "border:1px solid #ffffff33; color:#cfe0f5; border-radius:5px; font-size:9px; }", 1),
    (".ws-hero-content > span svg { color:#d5c187; }",
     ".ws-hero-content > span svg { color:#6fe3d6; }", 1),
    (".ws-hero h2 { font-size:23px; font-weight:700; margin:13px 0 7px; color:#f2f7ee; }",
     ".ws-hero h2 { font-size:23px; font-weight:700; margin:13px 0 7px; color:#eef4fd; }", 1),
    (".ws-hero p { font-size:11px; color:#c4d8c9; line-height:2; margin:0; }",
     ".ws-hero p { font-size:11px; color:#b9cbe8; line-height:2; margin:0; }", 1),
    (".ws-hero-content > a { display:inline-flex; align-items:center; gap:8px; background:#eff5e9; color:#245d40; border-radius:7px; padding:9px 14px; font-size:10px; font-weight:700; margin-top:14px; }",
     ".ws-hero-content > a { display:inline-flex; align-items:center; gap:8px; background:linear-gradient(135deg,#0d9488,#1153c4); color:#fff; border-radius:8px; padding:9px 14px; font-size:10px; font-weight:700; margin-top:14px; box-shadow:0 4px 12px rgba(13,148,136,.3); }", 1),
    (".ws-hero-caption { position:absolute; left:28px; bottom:25px; color:#e0d7b7a8; font-size:9px; }",
     ".ws-hero-caption { position:absolute; left:28px; bottom:25px; color:#c3d4eea8; font-size:9px; }", 1),

    # --- سایه‌ها و پنل‌ها: ته‌رنگ سبز → سرمه‌ای؛ شعاع مدرن‌تر ---
    (".ws-stat { min-height:105px; background:var(--surface); border:1px solid var(--line-soft); border-radius:10px; display:flex; gap:13px; padding:17px 16px; box-shadow:0 3px 11px #2d5b380b; }",
     ".ws-stat { min-height:105px; background:var(--surface); border:1px solid var(--line-soft); border-radius:12px; display:flex; gap:13px; padding:17px 16px; box-shadow:0 4px 14px #10294e0f; }", 1),
    (".ws-panel { background:var(--surface); border:1px solid var(--line); border-radius:11px; box-shadow:0 3px 12px #2d5b380b; min-width:0; }",
     ".ws-panel { background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:0 4px 16px #10294e0d; min-width:0; }", 1),
    ("border-radius:10px; padding:14px 15px; box-shadow:0 3px 11px #2d5b380b; }",
     "border-radius:12px; padding:14px 15px; box-shadow:0 4px 14px #10294e0f; }", 1),
    ("border-radius:18px; overflow:hidden; background:var(--surface); border:1px solid var(--line); box-shadow:0 22px 65px #214c3510; }",
     "border-radius:20px; overflow:hidden; background:var(--surface); border:1px solid var(--line); box-shadow:0 22px 65px #10294e14; }", 1),
    ("box-shadow:0 4px 10px #14573f26; }", "box-shadow:0 4px 12px #0f766e33; }", 1),
    ("box-shadow:0 1px 3px #163f2d33;", "box-shadow:0 1px 3px #10294e33;", 1),
    ("box-shadow:-10px 0 35px #163f2d22;", "box-shadow:-10px 0 35px #10294e22;", 1),
    ("box-shadow:0 18px 44px #1d342d2b;", "box-shadow:0 18px 44px #10294e2e;", 1),
    ("background:rgba(20,52,42,.42);", "background:rgba(8,20,40,.45);", 1),
    ("box-shadow:0 22px 60px rgba(13,41,32,.28);", "box-shadow:0 22px 60px rgba(10,26,52,.3);", 1),
    ("background:rgba(20,52,42,.45);", "background:rgba(8,20,40,.5);", 1),
    ("box-shadow:0 22px 60px rgba(13,41,32,.3);", "box-shadow:0 22px 60px rgba(10,26,52,.32);", 1),
    ("box-shadow: inset 0 0 0 1.5px #7db9a4; }", "box-shadow: inset 0 0 0 1.5px #56c8bf; }", 1),

    # --- توقف فاصله‌گذاری منفی روی خط فارسی (تایپوگرافی) ---
    (" letter-spacing:-.8px;", "", 1),
    (" letter-spacing:-.4px;", "", None),

    # --- اکسنت بنفش بخش پیامک → فیروزهٔ برند ---
    ("var(--accent, #7c3aed)", "var(--brand)", None),

    # --- بخش API (الحاقیهٔ ۲.۱۵.۰): سبز هاردکد → توکن‌ها (درست شدن تم شبانه هم) ---
    (".api-tabs button { border:1px solid #dbe7e2; background:#fff; color:#2f4d43; border-radius:10px; padding:9px 16px; font-size:12px; cursor:pointer; }",
     ".api-tabs button { border:1px solid var(--line); background:var(--surface); color:var(--ink-soft); border-radius:10px; padding:9px 16px; font-size:12px; cursor:pointer; }", 1),
    (".api-tabs button.active { background:#145943; color:#fff; border-color:#145943; }",
     ".api-tabs button.active { background:var(--brand); color:#fff; border-color:var(--brand); }", 1),
    (".api-form label { display:grid; gap:5px; font-size:12px; color:#2f4d43; }",
     ".api-form label { display:grid; gap:5px; font-size:12px; color:var(--ink-soft); }", 1),
    (".api-form input,.api-form select,.api-form textarea { border:1px solid #dbe7e2;",
     ".api-form input,.api-form select,.api-form textarea { border:1px solid var(--line);", 1),
    (".api-scopes { border:1px solid #dbe7e2;", ".api-scopes { border:1px solid var(--line);", 1),
    (".api-scope small { color:#7c948b; }", ".api-scope small { color:var(--muted-2); }", 1),
    (".api-secret { border:1px dashed #145943; background:#f2faf6;",
     ".api-secret { border:1px dashed var(--brand); background:var(--tint);", 1),
    ("font-size:12px; background:#fff; padding:9px; border-radius:8px; }",
     "font-size:12px; background:var(--surface); padding:9px; border-radius:8px; }", 1),
    (".api-row { border:1px solid #e4eeea;", ".api-row { border:1px solid var(--line-soft);", 1),
    ("font-size:11px; color:#4f6e64; word-break:break-all; }",
     "font-size:11px; color:var(--muted); word-break:break-all; }", 1),
    (".api-row-main span { font-size:12px; color:#2f4d43; }",
     ".api-row-main span { font-size:12px; color:var(--ink-soft); }", 1),
    (".api-row-main small { font-size:10px; color:#7c948b; }",
     ".api-row-main small { font-size:10px; color:var(--muted-2); }", 1),
    ("border-radius:99px; background:#f0f3f1; color:#6b8079; }",
     "border-radius:99px; background:var(--surface-2); color:var(--muted-2); }", 1),
    (".api-pill-ok { background:#e6f4ec; color:#1c7a4c; }",
     ".api-pill-ok { background:var(--chip); color:var(--success); }", 1),
    (".api-pill-fail { background:#fdeaea; color:#b3362f; }",
     ".api-pill-fail { background:var(--danger-tint); color:var(--danger-soft); }", 1),
    ("border-radius:99px; background:#cbd5d0; display:inline-block; }",
     "border-radius:99px; background:var(--line-strong); display:inline-block; }", 1),
    (".api-dot-ok { background:#22a35f; }", ".api-dot-ok { background:var(--success); }", 1),
    (".api-dot-fail { background:#d64541; }", ".api-dot-fail { background:var(--danger); }", 1),
    (".api-danger { border:1px solid #f0cfcd; background:#fff; color:#b3362f;",
     ".api-danger { border:1px solid var(--danger-line); background:var(--surface); color:var(--danger-soft);", 1),
    (".api-empty { font-size:12px; color:#7c948b; }",
     ".api-empty { font-size:12px; color:var(--muted-2); }", 1),
    (".api-notice { font-size:12px; color:#1c7a4c; background:#e6f4ec;",
     ".api-notice { font-size:12px; color:var(--success); background:var(--chip);", 1),
    (".api-notice-fail { color:#b3362f; background:#fdeaea; }",
     ".api-notice-fail { color:var(--danger-soft); background:var(--danger-tint); }", 1),
    (".api-overview-note h3 { font-size:14px; color:#145943;",
     ".api-overview-note h3 { font-size:14px; color:var(--brand-text);", 1),
    (".api-overview-note p { font-size:12px; line-height:2; color:#3f5d54; }",
     ".api-overview-note p { font-size:12px; line-height:2; color:var(--ink-body); }", 1),
    (".api-overview-note code { direction:ltr; background:#f0f7f3;",
     ".api-overview-note code { direction:ltr; background:var(--tint);", 1),
    (".api-log-table { border:1px solid #e4eeea;", ".api-log-table { border:1px solid var(--line-soft);", 1),
    (".api-log-head { background:#eaf4ed; color:#145943;",
     ".api-log-head { background:var(--chip); color:var(--brand-text);", 1),
    (".api-log-row { border-top:1px solid #eef4f1; color:#2f4d43; }",
     ".api-log-row { border-top:1px solid var(--line-soft); color:var(--ink-body); }", 1),
    (".api-log-error { color:#b3362f;", ".api-log-error { color:var(--danger-soft);", 1),
    ("background:#0f2f26; color:#d7e8e0;", "background:#0c2140; color:#cfe0f0;", 1),
    (".api-docs h3 { font-size:13px; color:#145943;", ".api-docs h3 { font-size:13px; color:var(--brand-text);", 1),
    (".api-docs p { font-size:12px; line-height:2; color:#3f5d54; }",
     ".api-docs p { font-size:12px; line-height:2; color:var(--ink-body); }", 1),
    (".api-docs code { direction:ltr; background:#f0f7f3; padding:1px 6px; border-radius:5px; }",
     ".api-docs code { direction:ltr; background:var(--tint); padding:1px 6px; border-radius:5px; }", 1),
    (".api-settings-form small { font-size:11px; color:#7c948b; }",
     ".api-settings-form small { font-size:11px; color:var(--muted-2); }", 1),
]

# شعاع دکمه‌ها/فیلدها: ۸ → ۱۰ پیکسل (ظاهر گردتر و مدرن‌تر)
RADIUS_OLD, RADIUS_NEW = "border-radius:8px", "border-radius:10px"

# بلوک چاپ با پالت تازه (مقادیر تم روشن جدید)
PRINT_OLD = """@media print {
  html[data-theme="dark"] {
    color-scheme: light;
    --bg: #f5f8f5; --bg-soft: #f6f9f6; --surface: #ffffff; --surface-2: #fcfdfc;
    --ink: #1d342d; --ink-soft: #24352f; --ink-body: #263f32;
    --muted: #5b7565; --muted-2: #8b9c91; --muted-3: #a3b2a7;
    --line: #e8efea; --line-soft: #edf2ee; --line-strong: #c8ded0;
    --brand: #145c43; --brand-hover: #0e573b; --brand-text: #145943; --on-brand: #ffffff;
    --tint: #f5faf6; --chip: #eaf5ed; --ring: #edf7ef;
    --gold: #b69b65; --gold-text: #b19456; --gold-bright: #c4ab74; --gold-tint: #fbf6e9; --gold-line: #efe8d2;
    --danger: #c0564c; --danger-soft: #ba645b; --danger-tint: #fdf6f5; --danger-line: #f1d9d5;
    --success: #3f7d55; --info: #4a6899; --info-tint: #f1f4fb; --info-line: #dfe7f4;
    --mint-bg: #eaf5ee; --mint-ink: #38835f;
    --goldchip-bg: #f8f3e6; --goldchip-ink: #b19456;
    --bluechip-bg: #eef5f5; --bluechip-ink: #679b99;
    --lavchip-bg: #f1f1f9; --lavchip-ink: #9094b6;
    --shadow-tint: 18, 89, 67;
    --focus-ring: #bda876; --selection-bg: #d9e9df; --selection-ink: #174f3f;
    --link: #438663; --link-hover: #174f37;
  }
}"""

PRINT_NEW = """@media print {
  html[data-theme="dark"] {
    color-scheme: light;
    --bg: #eef3f9; --bg-soft: #f2f6fb; --surface: #ffffff; --surface-2: #f7fafd;
    --ink: #122b52; --ink-soft: #1d3a63; --ink-body: #2c4568;
    --muted: #54698c; --muted-2: #7d92b0; --muted-3: #9aabc4;
    --line: #e1e9f3; --line-soft: #e9eff7; --line-strong: #c3d5ea;
    --brand: #0d9488; --brand-hover: #0b7f75; --brand-text: #14315c; --on-brand: #ffffff;
    --tint: #eef6f7; --chip: #dcf1f1; --ring: #e3f4f4;
    --gold: #c0913c; --gold-text: #a3761f; --gold-bright: #d1a24b; --gold-tint: #fbf4e4; --gold-line: #efe1c2;
    --danger: #cc4b44; --danger-soft: #bf443e; --danger-tint: #fdf4f3; --danger-line: #f1d7d4;
    --success: #0d9488; --info: #2e6ed9; --info-tint: #edf3fe; --info-line: #d9e6fb;
    --mint-bg: #dcf1f1; --mint-ink: #0b6f68;
    --goldchip-bg: #faefdb; --goldchip-ink: #a3761f;
    --bluechip-bg: #e7effd; --bluechip-ink: #2e6ed9;
    --lavchip-bg: #eceafa; --lavchip-ink: #6d5fcf;
    --shadow-tint: 18, 42, 82;
    --focus-ring: #54b8b1; --selection-bg: #d3ecef; --selection-ink: #0b4f4a;
    --link: #0b7f75; --link-hover: #095e57;
  }
}"""

APPEND = """
/* ============================================================
   الحاقیهٔ ۲.۲۰.۰ — بازطراحی بصری: سایدبار سرمه‌ای، دکمهٔ اصلی
   گرادیانی و پالیش سطح‌ها. فقط استایل؛ هیچ سلکتور ساختاری
   قبلی حذف یا جابه‌جا نشده است.
   ============================================================ */

/* --- سایدبار سرمه‌ای (در هر دو تم ثابت است — هویت برند) --- */
.ws-sidebar { background:linear-gradient(180deg,#0e2148 0%,#0a1734 100%); border-left:1px solid rgba(255,255,255,.08); }
.ws-sidebar-brand { border-bottom:1px solid rgba(255,255,255,.1); }
.ws-sidebar-brand strong { color:#f2f6fd; }
.ws-sidebar-brand small { color:#8ea3c2; }
.ws-nav-label { color:#6d84a8; }
.ws-nav-link { color:#b4c4de; transition:background .15s, color .15s; }
.ws-nav-link svg { color:#7f95b8; }
.ws-nav-link:hover { background:rgba(255,255,255,.07); color:#fff; }
.ws-nav-link:hover svg { color:#fff; }
.ws-nav-link.active { background:linear-gradient(135deg,#0d9488,#1153c4); color:#fff; box-shadow:0 6px 16px rgba(13,148,136,.35); }
.ws-nav-link.active svg { color:#fff; }
.ws-nav-link.active i { background:#a7f3ec; }
.ws-side-note { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.12); color:#9fb2cf; }
.ws-side-note strong { color:#d7e2f3; }
.ws-side-note p { color:#8ea3c2; }
.ws-sidebar-bottom { border-top:1px solid rgba(255,255,255,.1); }
.ws-sidebar-bottom strong { color:#e4ebf7; }
.ws-sidebar-bottom small { color:#7f95b5; }
.ws-sidebar-bottom button { color:#7f95b5; }
.ws-sidebar-bottom button:hover { color:#fff; }
.ws-sidebar .ws-avatar { background:rgba(255,255,255,.1); color:#6fe3d6; }
.ws-sidebar-scroll { scrollbar-color:rgba(255,255,255,.2) transparent; }
@media (max-width:850px) { .ws-sidebar .ws-close { border-color:rgba(255,255,255,.2); background:rgba(255,255,255,.06); color:#c7d5ea; } }

/* --- دکمهٔ اصلی گرادیانی (فیروزه ← آبی) مطابق هویت تازه --- */
.primary-button, .ws-btn, .cls-btn-primary { background:linear-gradient(135deg,#0d9488 0%,#1153c4 100%); border-color:transparent; box-shadow:0 4px 12px rgba(13,148,136,.28); }
.primary-button:hover, .ws-btn:hover, .cls-btn-primary:hover { background:linear-gradient(135deg,#0d9488 0%,#1153c4 100%); filter:brightness(1.07); }
.primary-button:disabled, .ws-btn:disabled, .cls-btn-primary:disabled { filter:none; }

/* --- پالیش نوار بالا و فیلدها --- */
.ws-topbar { box-shadow:0 2px 10px rgba(15,42,82,.05); }
.ws-search { border-radius:10px; }
"""

def main():
    with open(PATH, encoding="utf-8") as f:
        css = f.read()

    errors = []
    for old, new, expected in REPLACEMENTS:
        n = css.count(old)
        if n == 0:
            errors.append(f"NOT FOUND: {old[:90]}")
            continue
        if expected is not None and n != expected:
            errors.append(f"COUNT {n} != {expected}: {old[:90]}")
            continue
        css = css.replace(old, new)

    n_radius = css.count(RADIUS_OLD)
    if n_radius == 0:
        errors.append("NOT FOUND: border-radius:8px")
    else:
        css = css.replace(RADIUS_OLD, RADIUS_NEW)

    n_print = css.count(PRINT_OLD)
    if n_print != 1:
        errors.append(f"PRINT BLOCK count={n_print}")
    else:
        css = css.replace(PRINT_OLD, PRINT_NEW)

    if errors:
        for e in errors:
            print("✗", e)
        sys.exit(1)

    css += APPEND
    with open(PATH, "w", encoding="utf-8") as f:
        f.write(css)

    print(f"✓ {len(REPLACEMENTS)} جایگزینی هدفمند + {n_radius} شعاع ۸→۱۰ + بلوک چاپ تازه + بلوک ضمیمه ({len(APPEND)} بایت) اعمال شد")
    # وریفای: هیچ سبز برند قدیمی یا بنفش اکسنت باقی نمانده باشد
    leftovers = [h for h in ("#145740", "#104c3a", "#0e4d3a", "#145943", "#104d3e",
                             "#7c3aed", "#2d5b380b", "#163f2d", "#d5c28b", "#7db9a4",
                             "#dbe7e2", "#2f4d43", "#f0f7f3", "#eaf4ed", "#22a35f") if h in css]
    if leftovers:
        print("بقایا:", leftovers); sys.exit(1)
    print("✓ هیچ رنگ قدیمی سبز/بنفش باقی نمانده است")

if __name__ == "__main__":
    main()
