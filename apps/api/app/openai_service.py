import asyncio
import json
from typing import Any

import httpx

from .config import get_settings


class OpenAIServiceError(RuntimeError):
    pass


class OpenAIService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _headers(self) -> dict[str, str]:
        if not self.settings.openai_api_key:
            raise OpenAIServiceError("OPENAI_API_KEY is not configured")
        return {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
        }

    async def _json(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        timeout: float = 120,
    ) -> dict[str, Any]:
        url = f"{self.settings.openai_base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = self._headers()
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.request(method, url, headers=headers, json=json_body)

        if response.is_error:
            detail = response.text[:1000]
            raise OpenAIServiceError(f"OpenAI API returned HTTP {response.status_code}: {detail}")

        return response.json()

    async def delete_resource(self, resource: str, resource_id: str) -> None:
        from urllib.parse import quote

        if resource not in {"files", "vector_stores", "responses"}:
            raise ValueError("Unsupported cleanup resource")
        url = (
            f"{self.settings.openai_base_url.rstrip('/')}/{resource}/{quote(resource_id, safe='')}"
        )
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.delete(url, headers=self._headers())
        if response.status_code == 404:
            return
        if response.is_error:
            raise OpenAIServiceError(f"OpenAI cleanup failed (HTTP {response.status_code})")

    async def upload_file(
        self,
        *,
        filename: str,
        content: bytes,
        mime_type: str | None,
    ) -> str:
        url = f"{self.settings.openai_base_url.rstrip('/')}/files"
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                url,
                headers=self._headers(),
                data={"purpose": "assistants"},
                files={
                    "file": (
                        filename,
                        content,
                        mime_type or "application/octet-stream",
                    )
                },
            )

        if response.is_error:
            raise OpenAIServiceError(
                f"OpenAI file upload failed (HTTP {response.status_code}): {response.text[:1000]}"
            )

        return str(response.json()["id"])

    async def create_vector_store(self, *, name: str) -> str:
        result = await self._json(
            "POST",
            "/vector_stores",
            json_body={"name": name},
        )
        return str(result["id"])

    async def attach_file(self, *, vector_store_id: str, file_id: str) -> dict[str, Any]:
        return await self._json(
            "POST",
            f"/vector_stores/{vector_store_id}/files",
            json_body={"file_id": file_id},
        )

    async def get_vector_file(
        self,
        *,
        vector_store_id: str,
        file_id: str,
    ) -> dict[str, Any]:
        return await self._json(
            "GET",
            f"/vector_stores/{vector_store_id}/files/{file_id}",
        )

    async def wait_for_vector_file(
        self,
        *,
        vector_store_id: str,
        file_id: str,
        attempts: int = 12,
    ) -> str:
        status = "in_progress"
        for _ in range(attempts):
            item = await self.get_vector_file(
                vector_store_id=vector_store_id,
                file_id=file_id,
            )
            status = str(item.get("status", status))
            if status in {"completed", "failed", "cancelled"}:
                return status
            await asyncio.sleep(1)
        return status

    async def respond(
        self,
        *,
        input_items: str | list[dict[str, Any]],
        instructions: str,
        vector_store_id: str | None = None,
        filters: dict[str, Any] | None = None,
        schema_name: str | None = None,
        schema: dict[str, Any] | None = None,
        max_output_tokens: int = 4000,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.settings.openai_model,
            "store": False,
            "instructions": instructions,
            "input": input_items,
            "reasoning": {"effort": self.settings.openai_reasoning_effort},
            "max_output_tokens": max_output_tokens,
        }

        if vector_store_id:
            payload["tools"] = [
                {
                    "type": "file_search",
                    "vector_store_ids": [vector_store_id],
                    "max_num_results": 8,
                }
            ]

        if vector_store_id and filters:
            payload["tools"][0]["filters"] = filters

        if schema is not None:
            payload["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": schema_name or "structured_response",
                    "strict": True,
                    "schema": schema,
                }
            }

        return await self._json(
            "POST",
            "/responses",
            json_body=payload,
            timeout=180,
        )

    @staticmethod
    def output_text(response: dict[str, Any]) -> str:
        chunks: list[str] = []
        for item in response.get("output", []):
            if item.get("type") != "message":
                continue
            for part in item.get("content", []):
                if part.get("type") == "output_text" and part.get("text"):
                    chunks.append(str(part["text"]))
        return "\n".join(chunks).strip()

    @classmethod
    def output_json(cls, response: dict[str, Any]) -> dict[str, Any]:
        text = cls.output_text(response)
        if not text:
            raise OpenAIServiceError("OpenAI returned no structured output")
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise OpenAIServiceError("OpenAI returned invalid JSON") from exc

    @staticmethod
    def usage(response: dict[str, Any]) -> dict[str, int]:
        usage = response.get("usage") or {}
        input_tokens = int(usage.get("input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": int(usage.get("total_tokens") or input_tokens + output_tokens),
        }


openai_service = OpenAIService()
