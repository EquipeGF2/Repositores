import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { googleDriveService } from './googleDrive.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.ultimoAlertaTokenExpirado = null; // Timestamp do último alerta enviado
  }

  async createTransporter() {
    if (this.transporter) return;

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email.user,
        pass: config.email.password
      }
    });

    // Verificar conexão
    try {
      await this.transporter.verify();
      console.log('✅ Serviço de e-mail configurado (Gmail)');
    } catch (error) {
      console.error('❌ Erro ao configurar e-mail:', error.message);
      throw error;
    }
  }

  async enviarResumoVisitasDia(dataReferencia, visitas) {
    await this.createTransporter();

    try {
      // Agrupar visitas por repositor
      const visitasPorRepositor = this.agruparPorRepositor(visitas);

      // Montar HTML do e-mail
      const html = await this.montarHtmlResumo(dataReferencia, visitasPorRepositor);

      // Enviar e-mail
      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.user}>`,
        to: config.email.destinatarios.join(','),
        subject: `Resumo de Roteiro dos Repositores - ${this.formatarData(dataReferencia)}`,
        html
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log(`📧 E-mail enviado: ${info.messageId}`);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Erro ao enviar e-mail:', error.message);
      throw error;
    }
  }

  agruparPorRepositor(visitas) {
    const grupos = {};

    visitas.forEach(visita => {
      const repId = visita.rep_id;

      if (!grupos[repId]) {
        grupos[repId] = {
          repId,
          repoNome: visita.repo_nome,
          visitas: []
        };
      }

      grupos[repId].visitas.push(visita);
    });

    return Object.values(grupos);
  }

  async montarHtmlResumo(dataReferencia, visitasPorRepositor) {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          h1 {
            color: #dc2626;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .data {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 30px;
          }
          .repositor {
            background: #fef2f2;
            border-left: 4px solid #ef4444;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 8px;
          }
          .repositor h2 {
            color: #991b1b;
            font-size: 18px;
            margin: 0 0 10px 0;
          }
          .info {
            color: #374151;
            font-size: 14px;
            line-height: 1.6;
          }
          .link {
            display: inline-block;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 13px;
            font-weight: 600;
            margin-top: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #fecaca;
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 Resumo de Roteiro dos Repositores</h1>
          <div class="data">Data: ${this.formatarData(dataReferencia)}</div>
    `;

    if (visitasPorRepositor.length === 0) {
      html += `
          <div class="repositor">
            <p class="info">Nenhuma visita registrada nesta data.</p>
          </div>
      `;
    } else {
      for (const grupo of visitasPorRepositor) {
        const linkPasta = await googleDriveService.obterLinkPasta(grupo.repId);

        html += `
          <div class="repositor">
            <h2>${grupo.repoNome}</h2>
            <p class="info">
              <strong>${grupo.visitas.length}</strong> visita(s) registrada(s)
            </p>
        `;

        if (linkPasta) {
          html += `
            <a href="${linkPasta}" class="link">📁 Ver Fotos no Drive</a>
          `;
        }

        html += `
          </div>
        `;
      }

      // Link para pasta raiz
      html += `
          <div style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
            <p class="info" style="margin: 0;">
              <strong>📂 Pasta Raiz:</strong>
              <a href="https://drive.google.com/drive/folders/${config.drive.rootFolderId}" style="color: #ef4444;">
                Ver todas as pastas de repositores
              </a>
            </p>
          </div>
      `;
    }

    html += `
          <div class="footer">
            Sistema de Repositores • Germani Alimentos<br>
            Este é um e-mail automático, não responda.
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  }

  formatarData(data) {
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  async enviarAlertaTokenExpirado() {
    // Evitar spam: enviar apenas 1 email por dia
    const agora = Date.now();
    const umDiaEmMs = 24 * 60 * 60 * 1000;

    if (this.ultimoAlertaTokenExpirado && (agora - this.ultimoAlertaTokenExpirado) < umDiaEmMs) {
      console.log('⏭️ Alerta de token expirado já enviado nas últimas 24h. Pulando...');
      return { success: true, skipped: true, reason: 'Already sent in last 24h' };
    }

    await this.createTransporter();

    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, sans-serif;
              background: #f5f5f5;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: white;
              border-radius: 12px;
              padding: 30px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .alert {
              background: #fef2f2;
              border-left: 4px solid #ef4444;
              padding: 20px;
              margin-bottom: 20px;
              border-radius: 8px;
            }
            h1 {
              color: #dc2626;
              font-size: 24px;
              margin: 0 0 10px 0;
            }
            p {
              color: #374151;
              line-height: 1.6;
              margin: 10px 0;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #ef4444, #dc2626);
              color: white;
              padding: 12px 24px;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 600;
              margin-top: 15px;
            }
            .code {
              background: #f9fafb;
              padding: 15px;
              border-radius: 6px;
              font-family: monospace;
              font-size: 14px;
              margin: 15px 0;
              border: 1px solid #e5e7eb;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #fecaca;
              text-align: center;
              color: #9ca3af;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="alert">
              <h1>⚠️ Token OAuth do Google Drive Expirado</h1>
            </div>

            <p><strong>O sistema está operando em modo offline.</strong></p>

            <p>O token de autenticação do Google Drive expirou ou está inválido.
            Os check-ins estão sendo salvos localmente e serão enviados ao Drive
            após a renovação do token.</p>

            <h3>Como resolver:</h3>

            <p><strong>1.</strong> Acesse a URL abaixo para renovar o token:</p>
            <div class="code">
              https://seu-app.onrender.com/api/google/oauth/start
            </div>

            <p><strong>2.</strong> Autorize o acesso ao Google Drive</p>

            <p><strong>3.</strong> Copie o <code>refresh_token</code> gerado</p>

            <p><strong>4.</strong> Atualize no Render:</p>
            <div class="code">
              Dashboard → Environment → GOOGLE_OAUTH_REFRESH_TOKEN
            </div>

            <p><strong>5.</strong> O serviço reiniciará automaticamente</p>

            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">

            <p><strong>ℹ️ Sobre o Token OAuth:</strong></p>
            <ul style="color: #6b7280; font-size: 14px;">
              <li>Refresh tokens do Google <strong>não expiram</strong> se usados regularmente</li>
              <li>Podem expirar após <strong>6 meses sem uso</strong></li>
              <li>Expiram se o usuário revogar o acesso manualmente</li>
              <li>Limite de 50 tokens por conta (tokens antigos expiram)</li>
            </ul>

            <div class="footer">
              Sistema de Repositores • Germani Alimentos<br>
              Enviado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}<br>
              Este é um e-mail automático, não responda.
            </div>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.user}>`,
        to: 'genaro@germani.com.br',
        subject: '⚠️ URGENTE: Token Google Drive Expirado - Sistema em Modo Offline',
        html
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`📧 Alerta de token expirado enviado para: genaro@germani.com.br`);

      // Registrar timestamp do envio
      this.ultimoAlertaTokenExpirado = agora;

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Erro ao enviar alerta de token expirado:', error.message);
      // Não lançar erro - falha no envio de email não deve afetar o sistema
      return { success: false, error: error.message };
    }
  }
}

export const emailService = new EmailService();
