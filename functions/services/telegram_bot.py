"""Telegram Bot notifications for alerts and reports."""
import os
import logging
import requests

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self):
        self.token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self.chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
        self.base_url = f"https://api.telegram.org/bot{self.token}"

    def send_message(self, text: str, parse_mode: str = "Markdown") -> bool:
        if not self.token or not self.chat_id:
            logger.warning("Telegram not configured (missing BOT_TOKEN or CHAT_ID)")
            return False

        try:
            resp = requests.post(
                f"{self.base_url}/sendMessage",
                json={
                    "chat_id": self.chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                logger.info("Telegram message sent successfully")
                return True
            else:
                logger.error(f"Telegram API error {resp.status_code}: {resp.text}")
                return False
        except Exception as e:
            logger.error(f"Telegram send failed: {e}")
            return False

    def send_photo(self, photo_url: str, caption: str = "") -> bool:
        if not self.token or not self.chat_id:
            return False
        try:
            resp = requests.post(
                f"{self.base_url}/sendPhoto",
                json={
                    "chat_id": self.chat_id,
                    "photo": photo_url,
                    "caption": caption,
                    "parse_mode": "Markdown",
                },
                timeout=15,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Telegram photo send failed: {e}")
            return False

    def send_document(self, file_url: str, caption: str = "") -> bool:
        if not self.token or not self.chat_id:
            return False
        try:
            resp = requests.post(
                f"{self.base_url}/sendDocument",
                json={
                    "chat_id": self.chat_id,
                    "document": file_url,
                    "caption": caption,
                    "parse_mode": "Markdown",
                },
                timeout=15,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Telegram document send failed: {e}")
            return False
