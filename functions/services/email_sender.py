"""Email notifications via SendGrid."""
import os
import logging

logger = logging.getLogger(__name__)


class EmailSender:
    def __init__(self):
        self.api_key = os.environ.get("SENDGRID_API_KEY", "")
        self.from_email = os.environ.get("ALERT_EMAIL_FROM", "alerts@example.com")
        self.to_email = os.environ.get("ALERT_EMAIL_TO", "")

    def send(self, subject: str, html_content: str, to_email: str | None = None) -> bool:
        if not self.api_key:
            logger.warning("SendGrid not configured (missing API key)")
            return False

        recipient = to_email or self.to_email
        if not recipient:
            logger.warning("No recipient email configured")
            return False

        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail

            message = Mail(
                from_email=self.from_email,
                to_emails=recipient,
                subject=subject,
                html_content=html_content,
            )

            sg = SendGridAPIClient(self.api_key)
            response = sg.send(message)

            if response.status_code in (200, 201, 202):
                logger.info(f"Email sent to {recipient}: {subject}")
                return True
            else:
                logger.error(f"SendGrid error {response.status_code}: {response.body}")
                return False

        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return False

    def send_with_attachment(
        self,
        subject: str,
        html_content: str,
        attachment_data: bytes,
        attachment_filename: str,
        attachment_type: str = "application/pdf",
    ) -> bool:
        if not self.api_key:
            return False

        try:
            import base64
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition

            message = Mail(
                from_email=self.from_email,
                to_emails=self.to_email,
                subject=subject,
                html_content=html_content,
            )

            encoded = base64.b64encode(attachment_data).decode()
            attachment = Attachment(
                FileContent(encoded),
                FileName(attachment_filename),
                FileType(attachment_type),
                Disposition("attachment"),
            )
            message.attachment = attachment

            sg = SendGridAPIClient(self.api_key)
            response = sg.send(message)
            return response.status_code in (200, 201, 202)

        except Exception as e:
            logger.error(f"Email with attachment failed: {e}")
            return False
