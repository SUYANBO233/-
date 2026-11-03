from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ROOT = BACKEND_ROOT.parent


@dataclass(frozen=True)
class Settings:
    catalog_path: Path = BACKEND_ROOT / 'data/decision.json'
    algorithm_factory: str = 'app.algorithms.configurable:create_algorithm'
    api_key: str = ''
    catalog_url: str = 'http://127.0.0.1:5000/api/internal/decision-catalog'
    catalog_api_key: str = ''
    response_factory: str = 'app.algorithms.response.base:create_unavailable'
    allow_test_responses: bool = False
    response_timeout: float = 5.0

    @classmethod
    def from_environment(cls) -> 'Settings':
        load_dotenv(ROOT / '.env.local', override=False)
        load_dotenv(ROOT / '.env', override=False)
        return cls(
            catalog_path=Path(os.getenv('BACKEND_CATALOG_PATH', str(cls.catalog_path))),
            algorithm_factory=os.getenv('DECISION_ALGORITHM_FACTORY', cls.algorithm_factory),
            api_key=os.getenv('DECISION_BACKEND_API_KEY', ''),
            catalog_url=os.getenv('DECISION_CATALOG_URL',cls.catalog_url),
            catalog_api_key=os.getenv('DECISION_CATALOG_API_KEY',''),
            response_factory=os.getenv('DECISION_RESPONSE_FACTORY',cls.response_factory),
            allow_test_responses=os.getenv('DECISION_ALLOW_TEST_RESPONSES')=='true' and os.getenv('DECISION_DATA_SOURCE')=='local-test',
            response_timeout=float(os.getenv('DECISION_RESPONSE_TIMEOUT_SECONDS','5')),
        )
