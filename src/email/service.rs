// E-Mail-Service für Token-Aktivierung
use anyhow::{Context, Result};
use lettre::{
    message::{header::ContentType, Mailbox, Message},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};

pub struct EmailService {
    smtp_host: String,
    smtp_port: u16,
    smtp_username: String,
    smtp_password: String,
    from_email: Mailbox,
    base_url: String,
}

impl EmailService {
    pub fn new(
        smtp_host: String,
        smtp_port: u16,
        smtp_username: String,
        smtp_password: String,
        from_email: String,
        from_name: Option<String>,
        base_url: String,
    ) -> Result<Self> {
        let mailbox = if let Some(name) = from_name {
            format!("{} <{}>", name, from_email)
                .parse()
                .context("Invalid from email")?
        } else {
            from_email.parse().context("Invalid from email")?
        };

        Ok(Self {
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password,
            from_email: mailbox,
            base_url,
        })
    }

    /// Send activation email with token activation link
    pub async fn send_activation_email(
        &self,
        to_email: &str,
        activation_code: &str,
    ) -> Result<()> {
        let activation_link = format!("{}/activate/{}", self.base_url, activation_code);

        let email_body = self.build_activation_email_html(&activation_link);

        let email = Message::builder()
            .from(self.from_email.clone())
            .to(to_email.parse()?)
            .subject("Aktiviere dein API-Token für PodInsights")
            .header(ContentType::TEXT_HTML)
            .body(email_body)?;

        self.send_email(email).await
    }

    /// Send email notifying user their token limit is reached
    pub async fn send_limit_reached_email(&self, to_email: &str, limit: i64) -> Result<()> {
        let email_body = self.build_limit_reached_email_html(limit);

        let email = Message::builder()
            .from(self.from_email.clone())
            .to(to_email.parse()?)
            .subject("Dein API-Token Limit wurde erreicht")
            .header(ContentType::TEXT_HTML)
            .body(email_body)?;

        self.send_email(email).await
    }

    async fn send_email(&self, email: Message) -> Result<()> {
        let creds = Credentials::new(self.smtp_username.clone(), self.smtp_password.clone());

        let mailer: AsyncSmtpTransport<Tokio1Executor> =
            AsyncSmtpTransport::<Tokio1Executor>::relay(&self.smtp_host)?
                .port(self.smtp_port)
                .credentials(creds)
                .build();

        mailer.send(email).await?;

        Ok(())
    }

    fn build_activation_email_html(&self, activation_link: &str) -> String {
        format!(
            r#"<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            border-radius: 10px;
        }}
        .content {{
            background: white;
            padding: 30px;
            border-radius: 8px;
        }}
        h1 {{
            color: #667eea;
            margin-top: 0;
        }}
        .button {{
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }}
        .info-box {{
            background: #f7fafc;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin: 20px 0;
        }}
        .footer {{
            text-align: center;
            font-size: 12px;
            color: white;
            margin-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <h1>🎉 Willkommen bei PodInsights!</h1>
            
            <p>Du hast erfolgreich ein API-Token für unseren Chat-Bot angefordert.</p>
            
            <p>Klicke auf den Button unten, um dein Token zu aktivieren:</p>
            
            <a href="{}" class="button">Token jetzt aktivieren</a>
            
            <div class="info-box">
                <strong>📊 Dein Token-Limit:</strong><br>
                Du erhältst <strong>100 kostenlose Anfragen</strong> für den Chat-Bot.<br>
                Bei Bedarf kann das Limit vom Administrator erhöht werden.
            </div>
            
            <p><strong>⏰ Hinweis:</strong> Dieser Aktivierungslink ist 24 Stunden gültig.</p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            
            <p style="font-size: 12px; color: #666;">
                Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
                <a href="{}" style="color: #667eea; word-break: break-all;">{}</a>
            </p>
        </div>
        
        <div class="footer">
            <p>PodInsights - Intelligente Podcast-Analyse</p>
            <p>Diese E-Mail wurde automatisch generiert.</p>
        </div>
    </div>
</body>
</html>"#,
            activation_link, activation_link, activation_link
        )
    }

    fn build_limit_reached_email_html(&self, limit: i64) -> String {
        format!(
            r#"<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .container {{
            background: linear-gradient(135deg, #fc8181 0%, #f56565 100%);
            padding: 40px 20px;
            border-radius: 10px;
        }}
        .content {{
            background: white;
            padding: 30px;
            border-radius: 8px;
        }}
        h1 {{
            color: #f56565;
            margin-top: 0;
        }}
        .footer {{
            text-align: center;
            font-size: 12px;
            color: white;
            margin-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="content">
            <h1>🚦 Token-Limit erreicht</h1>
            
            <p>Dein API-Token hat das Limit von <strong>{} Anfragen</strong> erreicht.</p>
            
            <p>Um den Chat-Bot weiter zu nutzen, wende dich bitte an den Administrator.</p>
            
            <p>Vielen Dank für die Nutzung von PodInsights! 🙏</p>
        </div>
        
        <div class="footer">
            <p>PodInsights - Intelligente Podcast-Analyse</p>
        </div>
    </div>
</body>
</html>"#,
            limit
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_html_generation() {
        let service = EmailService::new(
            "smtp.example.com".to_string(),
            587,
            "user".to_string(),
            "pass".to_string(),
            "noreply@example.com".to_string(),
            Some("PodInsights".to_string()),
            "https://example.com".to_string(),
        )
        .unwrap();

        let html = service.build_activation_email_html("https://example.com/activate?code=abc123");
        assert!(html.contains("Token jetzt aktivieren"));
        assert!(html.contains("https://example.com/activate?code=abc123"));
        assert!(html.contains("100 kostenlose Anfragen"));
    }
}
