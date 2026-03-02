import time
import random
import logging
from functools import wraps

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BASE_DELAY = 2
MAX_DELAY = 60


class RateLimitExceeded(Exception):
    pass


class MetaAPIRateLimiter:
    """Tracks Meta API rate limit headers and implements exponential backoff."""

    def __init__(self):
        self._usage: dict[str, dict] = {}

    def update_from_headers(self, account_id: str, headers: dict):
        usage_header = headers.get("x-business-use-case-usage")
        if not usage_header:
            return
        try:
            import json
            usage_data = json.loads(usage_header)
            if account_id in usage_data:
                entries = usage_data[account_id]
                if entries:
                    self._usage[account_id] = entries[0]
        except (json.JSONDecodeError, KeyError, IndexError):
            pass

    def should_throttle(self, account_id: str) -> bool:
        usage = self._usage.get(account_id)
        if not usage:
            return False
        call_count = usage.get("call_count", 0)
        total_cputime = usage.get("total_cputime", 0)
        total_time = usage.get("total_time", 0)
        return any(v >= 75 for v in [call_count, total_cputime, total_time])

    def get_estimated_wait(self, account_id: str) -> int:
        usage = self._usage.get(account_id)
        if not usage:
            return 0
        return usage.get("estimated_time_to_regain_access", 0)


rate_limiter = MetaAPIRateLimiter()


def with_retry(func):
    """Decorator that retries on rate limit and transient errors with exponential backoff + jitter."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        last_exception = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                error_str = str(e).lower()
                is_rate_limit = "rate limit" in error_str or "too many" in error_str
                is_transient = "temporarily" in error_str or "timeout" in error_str

                if not (is_rate_limit or is_transient) or attempt == MAX_RETRIES:
                    raise

                delay = min(BASE_DELAY * (2 ** attempt) + random.uniform(0, 1), MAX_DELAY)
                logger.warning(
                    f"Retry {attempt + 1}/{MAX_RETRIES} for {func.__name__} after {delay:.1f}s: {e}"
                )
                time.sleep(delay)
        raise last_exception

    return wrapper
