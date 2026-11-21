#!/usr/bin/env python3
"""استقرار کرون کلاس‌ها (۲.۱۹.۰) روی cPanel — راز هرگز چاپ نمی‌شود.

usage:
  python3 cron2190.py prep            → فهرست کرون‌ها (ماسک‌شده) + ذخیرهٔ اسکریپت روی سرور + بررسی .env
  python3 cron2190.py add <minute>    → افزودن Job ساعتی (API2 Cron::addcron)
  python3 cron2190.py list            → فهرست کرون‌ها (ماسک‌شده)
"""
import json, re, subprocess, sys, os

CREDS = "/home/z/my-project/scripts/.cp-creds"
txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']*)'", txt).group(1)
USER = re.search(r"CP_USER='([^']*)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", txt).group(1)
JAR = "/tmp/cp-2190.jar"
HDR = "/tmp/cp-2190-hdr.txt"
HOME = f"/home/{USER}"
SCRIPT_NAME = "classes-cron.sh"
SCRIPT_BODY = """#!/bin/bash
# کرون سامانه نور — /api/cron/classes (الحاقیهٔ ۲.۱۹.۰)
# راز از فایل .cron-secret-2180 خوانده می‌شود (همان الگوی کرون رویدادهای ۲.۱۸.۰)؛ در crontab ذخیره نمی‌شود.
S=$(cat /home/%(user)s/.cron-secret-2180 2>/dev/null | head -1 | tr -d '\\r\\n')
OUT=$(curl -fsS -m 55 -H "Authorization: Bearer $S" https://pouyafarhadi.ir/api/cron/classes 2>&1)
echo "$(date '+%%F %%T') $OUT" >> %(home)s/classes-cron.log
tail -c 20000 %(home)s/classes-cron.log > %(home)s/.classes-cron.tmp 2>/dev/null && mv %(home)s/.classes-cron.tmp %(home)s/classes-cron.log
""" % {"user": USER, "home": HOME}

MASKS = [
    (re.compile(r"(Bearer\s+)\S+"), r"\1***"),
    (re.compile(r"(CRON_SECRET=)[^\s\"&]+"), r"\1***"),
    (re.compile(r"(token=)[^\s\"&]+"), r"\1***"),
]


def mask(s: str) -> str:
    for rx, rep in MASKS:
        s = rx.sub(rep, s)
    return s


def login():
    subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                    f"https://{HOST}:2083/login",
                    "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                    "-H", "User-Agent: Mozilla/5.0"], check=False)
    for ln in open(HDR):
        m = re.search(r"cpsess\d+", ln)
        if m:
            return m.group(0)
    print(json.dumps({"error": "LOGIN_FAILED"}))
    sys.exit(1)


def uapi(sess, path, pairs=()):
    pairs = list(pairs.items()) if isinstance(pairs, dict) else pairs
    args = []
    for k, v in pairs:
        if isinstance(v, str) and v.startswith("file:@"):
            v = open(v[6:]).read()
        args += ["--data-urlencode", f"{k}={v}"]
    raw = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                          f"https://{HOST}:2083/{sess}/execute/{path}",
                          "-H", "User-Agent: Mozilla/5.0"] + args,
                         capture_output=True, text=True).stdout
    return json.loads(raw)


def api2(sess, module, func, pairs=()):
    pairs = list(pairs.items()) if isinstance(pairs, dict) else pairs
    args = ["--data-urlencode", "cpanel_jsonapi_apiversion=2",
            "--data-urlencode", f"cpanel_jsonapi_module={module}",
            "--data-urlencode", f"cpanel_jsonapi_func={func}"]
    for k, v in pairs:
        args += ["--data-urlencode", f"{k}={v}"]
    raw = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                          f"https://{HOST}:2083/{sess}/json-api/cpanel"] + args,
                         capture_output=True, text=True).stdout
    return json.loads(raw)


def show_crons(sess):
    data = api2(sess, "Cron", "listcron")
    txt = mask(json.dumps(data))
    try:
        obj = json.loads(txt)
        rows = obj.get("cpanelresult", {}).get("data", [])
        jobs = [(r.get("minute"), r.get("hour"), r.get("command", "")[:120]) for r in rows]
        print(json.dumps({"crons": jobs}, ensure_ascii=False, indent=1))
    except Exception:
        print("RAW(listcron, masked):", txt[:400])


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "prep"
    sess = login()
    print("login: OK")
    if mode == "list":
        show_crons(sess)
        return
    if mode == "prep":
        show_crons(sess)
        args = ["--data-urlencode", f"dir={HOME}", "--data-urlencode", f"file={SCRIPT_NAME}",
                "--data-urlencode", f"content={SCRIPT_BODY}"]
        raw = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                              f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                              "-H", "User-Agent: Mozilla/5.0"] + args,
                             capture_output=True, text=True).stdout
        try:
            ok = json.loads(raw).get("status", 0)
        except Exception:
            ok = raw[:120]
        print("save_file_content:", ok)
        env = uapi(sess, "Fileman/get_file_content", {"dir": HOME, "file": ".cron-secret-2180"})
        data = (env.get("data") or {})
        content = data.get("content") or ""
        if content:
            sec = content.splitlines()[0].strip()
            with open("/tmp/cs.secret", "w") as f:
                f.write(sec)
            os.chmod("/tmp/cs.secret", 0o600)
            print("CRON_SECRET: present, length", len(sec))
        else:
            print("CRON_SECRET: MISSING", mask(json.dumps(env))[:150])
        return
    if mode == "add":
        minute = sys.argv[2]
        res = api2(sess, "Cron", "addcron",
                   {"minute": minute, "hour": "*", "day": "*", "month": "*", "weekday": "*",
                    "command": f"/bin/bash {HOME}/{SCRIPT_NAME} >/dev/null 2>&1"})
        print("addcron:", mask(json.dumps(res))[:220])
        show_crons(sess)
        return


if __name__ == "__main__":
    main()
