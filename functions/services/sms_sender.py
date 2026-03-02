"""SMS and WhatsApp notifications via Twilio."""
import os
import logging

logger = logging.getLogger(__name__)


class SMSSender:
    def __init__(self):
        self.account_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.auth_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.from_number = os.environ.get("TWILIO_PHONE_NUMBER", "")
        self.to_number = os.environ.get("ALERT_PHONE_NUMBER", "")

    def send(self, message: str, to_number: str | None = None) -> bool:
        if not self.account_sid or not self.auth_token:
            logger.warning("Twilio not configured (missing credentials)")
            return False

        recipient = to_number or self.to_number
        if not recipient:
            logger.warning("No recipient phone number configured")
            return False

        try:
            from twilio.rest import Client

            client = Client(self.account_sid, self.auth_token)
            truncated = message[:1600]

            msg = client.messages.create(
                body=truncated,
                from_=self.from_number,
                to=recipient,
            )
            logger.info(f"SMS sent: {msg.sid}")
            return True

        except Exception as e:
            logger.error(f"SMS send failed: {e}")
            return False

    def send_whatsapp(self, message: str, to_number: str | None = None) -> bool:
        if not self.account_sid or not self.auth_token:
            return False

        recipient = to_number or self.to_number
        if not recipient:
            return False

        try:
            from twilio.rest import Client

            client = Client(self.account_sid, self.auth_token)
            msg = client.messages.create(
                body=message[:1600],
                from_=f"whatsapp:{self.from_number}",
                to=f"whatsapp:{recipient}",
            )
            logger.info(f"WhatsApp sent: {msg.sid}")
            return True

        except Exception as e:
            logger.error(f"WhatsApp send failed: {e}")
            return False
