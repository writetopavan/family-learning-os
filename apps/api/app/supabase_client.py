from urllib.parse import quote

import httpx

from .config import get_settings


def _headers(access_token: str, *, prefer: str | None = None) -> dict[str, str]:
    settings = get_settings()
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


async def rest_request(
    method: str,
    path: str,
    access_token: str,
    *,
    params: dict[str, str] | None = None,
    json: object | None = None,
) -> object:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(
            method,
            url,
            headers=_headers(
                access_token,
                prefer="return=representation" if method.upper() in {"POST", "PATCH"} else None,
            ),
            params=params,
            json=json,
        )
    response.raise_for_status()
    if not response.content:
        return None
    return response.json()


async def rpc(function_name: str, access_token: str, payload: dict) -> object:
    return await rest_request(
        "POST",
        f"rpc/{function_name}",
        access_token,
        json=payload,
    )


async def storage_download(
    bucket: str,
    object_path: str,
    access_token: str,
) -> bytes:
    settings = get_settings()
    safe_path = quote(object_path.lstrip("/"), safe="/")
    url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/authenticated/"
        f"{quote(bucket, safe='')}/{safe_path}"
    )
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
    }
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.get(url, headers=headers)
    response.raise_for_status()
    return response.content
