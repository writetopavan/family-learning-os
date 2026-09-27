import httpx

from .config import get_settings


def _headers(access_token: str) -> dict[str, str]:
    settings = get_settings()
    return {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


async def rest_request(
    method: str,
    path: str,
    access_token: str,
    *,
    params: dict[str, str] | None = None,
    json: dict | None = None,
) -> object:
    settings = get_settings()
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.request(
            method,
            url,
            headers=_headers(access_token),
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
