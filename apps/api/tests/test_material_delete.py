import asyncio
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import HTTPException
from test_planning import ID, USER

from app.openai_service import OpenAIServiceError
from app.routes import documents


def setup(monkeypatch, file_id='file-source'):
    monkeypatch.setattr(documents, 'row', AsyncMock(return_value={
        'family_id': ID, 'storage_path': 'family/student/source.pdf', 'openai_file_id': file_id,
    }))
    parent = AsyncMock()
    monkeypatch.setattr(documents, 'require_parent', parent)
    events = []

    async def remote(*args):
        events.append(('openai', args))

    async def storage(*args):
        events.append(('storage', args))

    async def rpc(*args):
        events.append(('database', args))
        return {'deleted': ID}

    monkeypatch.setattr(documents.openai_service, 'delete_resource', AsyncMock(side_effect=remote))
    monkeypatch.setattr(documents, 'storage_remove', AsyncMock(side_effect=storage))
    monkeypatch.setattr(documents, 'rpc', AsyncMock(side_effect=rpc))
    return parent, events


def run():
    return asyncio.run(documents.delete_material(UUID(ID), 'Bearer token', USER))


def test_cleanup_order_and_shared_vector_store_preserved(monkeypatch):
    _, events = setup(monkeypatch)
    assert run() == {'deleted': ID}
    assert [e[0] for e in events] == ['openai', 'storage', 'database']
    assert events[0][1] == ('files', 'file-source')
    assert events[-1][1] == ('delete_learning_material', 'token', {'target_material': ID})


def test_pageindex_only_material_needs_no_openai_key(monkeypatch):
    _, events = setup(monkeypatch, None)
    run()
    assert [e[0] for e in events] == ['storage', 'database']


def test_failure_retains_row_for_retry(monkeypatch):
    setup(monkeypatch)
    documents.openai_service.delete_resource.side_effect = OpenAIServiceError('unavailable')
    with pytest.raises(HTTPException) as exc:
        run()
    assert exc.value.status_code == 503
    documents.rpc.assert_not_awaited()
    documents.storage_remove.assert_not_awaited()


def test_parent_authorization_precedes_external_cleanup(monkeypatch):
    parent, events = setup(monkeypatch)
    parent.side_effect = HTTPException(403, 'Only a parent')
    with pytest.raises(HTTPException) as exc:
        run()
    assert exc.value.status_code == 403
    assert events == []
