from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import whois
import dns.resolver
import json
import asyncio
import io
import struct
import zlib
from typing import Optional
from datetime import datetime

app = FastAPI(title="OSINT Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SOCIAL_PLATFORMS = {
    "github": "https://github.com/{username}",
    "twitter": "https://twitter.com/{username}",
    "instagram": "https://www.instagram.com/{username}/",
    "tiktok": "https://www.tiktok.com/@{username}",
    "reddit": "https://www.reddit.com/user/{username}",
    "pinterest": "https://www.pinterest.com/{username}/",
    "medium": "https://medium.com/@{username}",
    "dev.to": "https://dev.to/{username}",
    "gitlab": "https://gitlab.com/{username}",
    "steam": "https://steamcommunity.com/id/{username}",
    "twitch": "https://www.twitch.tv/{username}",
    "youtube": "https://www.youtube.com/@{username}",
    "linkedin": "https://www.linkedin.com/in/{username}",
    "snapchat": "https://www.snapchat.com/add/{username}",
    "telegram": "https://t.me/{username}",
}

NOT_FOUND_INDICATORS = {
    "github": ["Not Found", "Page not found"],
    "instagram": ["Sorry, this page", "Page Not Found"],
    "reddit": ["page not found", "Sorry, nobody"],
    "twitter": ["This account doesn't exist", "page doesn't exist"],
    "tiktok": ["Couldn't find this account"],
    "twitch": ["Sorry. Unless you've got a time machine"],
    "youtube": ["This page isn't available"],
    "steam": ["The specified profile could not be found"],
    "gitlab": ["404", "Not Found"],
    "medium": ["404", "Page not found"],
    "dev.to": ["404", "page not found"],
    "pinterest": ["Uh oh"],
    "snapchat": ["Sorry"],
    "telegram": ["If you have Telegram"],
    "linkedin": ["Page not found", "This page doesn't exist"],
}


class UsernameRequest(BaseModel):
    username: str


class EmailRequest(BaseModel):
    email: str


class DomainRequest(BaseModel):
    domain: str


class IPRequest(BaseModel):
    ip: str


@app.get("/")
async def root():
    return {"status": "OSINT Platform running"}


@app.post("/api/username")
async def search_username(req: UsernameRequest):
    username = req.username.strip()
    results = []

    async def check_platform(name: str, url_template: str):
        url = url_template.format(username=username)
        indicators = NOT_FOUND_INDICATORS.get(name, ["404", "not found", "doesn't exist"])
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                body = resp.text.lower()
                found = resp.status_code == 200 and not any(
                    ind.lower() in body for ind in indicators
                )
                return {"platform": name, "url": url, "found": found, "status": resp.status_code}
        except Exception as e:
            return {"platform": name, "url": url, "found": False, "status": 0, "error": str(e)}

    tasks = [check_platform(name, tmpl) for name, tmpl in SOCIAL_PLATFORMS.items()]
    results = await asyncio.gather(*tasks)
    found = [r for r in results if r["found"]]
    not_found = [r for r in results if not r["found"]]
    return {"username": username, "found": found, "not_found": not_found, "total_found": len(found)}


@app.post("/api/breach")
async def check_breach(req: EmailRequest):
    email = req.email.strip()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}",
                headers={
                    "User-Agent": "OSINT-Platform",
                    "hibp-api-key": "FREE-TIER-LIMITED",
                },
            )
            if resp.status_code == 404:
                return {"email": email, "breached": False, "breaches": [], "count": 0}
            if resp.status_code == 401:
                return {
                    "email": email,
                    "breached": None,
                    "note": "HIBP API key required for full results. Visit haveibeenpwned.com to check manually.",
                    "hibp_url": f"https://haveibeenpwned.com/account/{email}",
                }
            breaches = resp.json()
            return {
                "email": email,
                "breached": True,
                "count": len(breaches),
                "breaches": [
                    {
                        "name": b.get("Name"),
                        "date": b.get("BreachDate"),
                        "data_classes": b.get("DataClasses", []),
                        "description": b.get("Description", ""),
                    }
                    for b in breaches
                ],
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/domain")
async def lookup_domain(req: DomainRequest):
    domain = req.domain.strip().lower()
    result = {"domain": domain, "whois": None, "dns": {}}

    try:
        w = whois.whois(domain)
        result["whois"] = {
            "registrar": w.registrar,
            "creation_date": str(w.creation_date) if w.creation_date else None,
            "expiration_date": str(w.expiration_date) if w.expiration_date else None,
            "updated_date": str(w.updated_date) if w.updated_date else None,
            "name_servers": w.name_servers if isinstance(w.name_servers, list) else [w.name_servers] if w.name_servers else [],
            "status": w.status if isinstance(w.status, list) else [w.status] if w.status else [],
            "emails": w.emails if isinstance(w.emails, list) else [w.emails] if w.emails else [],
            "org": w.org,
            "country": w.country,
        }
    except Exception as e:
        result["whois"] = {"error": str(e)}

    record_types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME"]
    for rtype in record_types:
        try:
            answers = dns.resolver.resolve(domain, rtype, lifetime=5)
            result["dns"][rtype] = [str(r) for r in answers]
        except Exception:
            result["dns"][rtype] = []

    return result


@app.post("/api/ip")
async def lookup_ip(req: IPRequest):
    ip = req.ip.strip()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/json/")
            data = resp.json()
            return {
                "ip": ip,
                "city": data.get("city"),
                "region": data.get("region"),
                "country": data.get("country_name"),
                "country_code": data.get("country_code"),
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude"),
                "org": data.get("org"),
                "asn": data.get("asn"),
                "timezone": data.get("timezone"),
                "postal": data.get("postal"),
                "currency": data.get("currency"),
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/image/metadata")
async def extract_image_metadata(file: UploadFile = File(...)):
    content = await file.read()
    result = {
        "filename": file.filename,
        "size_bytes": len(content),
        "content_type": file.content_type,
        "exif": {},
        "gps": None,
    }

    try:
        from PIL import Image
        from PIL.ExifTags import TAGS, GPSTAGS
        img = Image.open(io.BytesIO(content))
        result["dimensions"] = {"width": img.width, "height": img.height}
        result["mode"] = img.mode
        result["format"] = img.format

        exif_data = img._getexif()
        if exif_data:
            gps_info = {}
            for tag_id, value in exif_data.items():
                tag = TAGS.get(tag_id, str(tag_id))
                if tag == "GPSInfo":
                    for gps_tag_id, gps_val in value.items():
                        gps_tag = GPSTAGS.get(gps_tag_id, str(gps_tag_id))
                        gps_info[gps_tag] = str(gps_val)
                    result["exif"]["GPSInfo"] = gps_info
                    try:
                        lat_ref = value.get(1, "N")
                        lat = value.get(2)
                        lon_ref = value.get(3, "E")
                        lon = value.get(4)
                        if lat and lon:
                            def to_decimal(coord, ref):
                                d, m, s = float(coord[0]), float(coord[1]), float(coord[2])
                                dec = d + m / 60 + s / 3600
                                if ref in ["S", "W"]:
                                    dec = -dec
                                return round(dec, 6)
                            result["gps"] = {
                                "latitude": to_decimal(lat, lat_ref),
                                "longitude": to_decimal(lon, lon_ref),
                                "maps_url": f"https://www.google.com/maps?q={to_decimal(lat, lat_ref)},{to_decimal(lon, lon_ref)}",
                            }
                    except Exception:
                        pass
                elif isinstance(value, bytes):
                    result["exif"][tag] = value.decode("utf-8", errors="replace")
                else:
                    result["exif"][tag] = str(value)
    except Exception as e:
        result["exif_error"] = str(e)

    return result
