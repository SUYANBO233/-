import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.algorithms.base import AlgorithmInputError, DecisionAlgorithm
from app.algorithms.registry import load_algorithm
from app.api.decision import router
from app.config import Settings
from app.repositories.catalog import CatalogRepository, JsonCatalogRepository
from app.services.decision import AlgorithmVersionConflict, DecisionService

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, *, algorithm: DecisionAlgorithm | None = None,
               repository: CatalogRepository | None = None) -> FastAPI:
    config = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        catalog = repository or JsonCatalogRepository(config.catalog_path)
        provider = algorithm or load_algorithm(config.algorithm_factory, catalog)
        application.state.settings = config
        application.state.decision_service = DecisionService(provider, catalog)
        yield

    application = FastAPI(title='隧道施工决策算法服务', version='1.0.0', lifespan=lifespan)
    application.include_router(router)

    @application.get('/health')
    def health(request: Request) -> dict[str, str]:
        service: DecisionService = request.app.state.decision_service
        return {'status': 'ok', 'algorithm': f'{service.algorithm.info.id}:{service.algorithm.info.version}'}

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError) -> JSONResponse:
        issues = [{'location': list(item['loc']), 'message': item['msg'], 'type': item['type']} for item in error.errors()]
        return JSONResponse(status_code=422, content={'message': '请求参数校验失败', 'issues': issues})

    @application.exception_handler(HTTPException)
    async def http_error(_request: Request, error: HTTPException) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content={'message': str(error.detail)})

    @application.exception_handler(AlgorithmInputError)
    async def algorithm_input_error(_request: Request, error: AlgorithmInputError) -> JSONResponse:
        return JSONResponse(status_code=400, content={'message': str(error)})

    @application.exception_handler(AlgorithmVersionConflict)
    async def algorithm_version_error(_request: Request, error: AlgorithmVersionConflict) -> JSONResponse:
        return JSONResponse(status_code=409, content={'message': str(error)})

    @application.exception_handler(Exception)
    async def unexpected_error(_request: Request, error: Exception) -> JSONResponse:
        logger.exception('算法执行失败', exc_info=error)
        return JSONResponse(status_code=500, content={'message': '算法执行失败，请检查服务端日志'})

    return application


app = create_app()
