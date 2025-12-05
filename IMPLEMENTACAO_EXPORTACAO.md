# 📄 Guia de Implementação: Exportação PDF e XLS

## ✅ O Que Já Foi Implementado

1. ✅ **Modal "Detalhes do Representante"** - Funcionando em todas as páginas
2. ✅ **Grid Clientes melhorada** - Coluna Grupo maior, botão Remover otimizado
3. ✅ **Filtro Roteiros Válidos** - Query já filtra corretamente
4. ✅ **Card Cidades Atendidas** - Design moderno com seleção múltipla
5. ⏳ **Exportação CSV** - Já existe, mas precisa melhorar formato

---

## 🎯 Próxima Implementação: PDF e XLS

### **1. Adicionar Bibliotecas Externas**

Editar `/public/index.html` e adicionar antes do fechamento de `</body>`:

```html
<!-- Bibliotecas para Exportação -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.7.1/jspdf.plugin.autotable.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

---

### **2. Modificar Interface de Consulta Roteiro**

Editar `/public/js/pages.js` na página `consulta-roteiro`:

**ANTES:**
```html
<button class="btn btn-success" id="btnExportarConsultaRoteiro">
    📊 Exportar Planilha
</button>
```

**DEPOIS:**
```html
<div class="btn-group">
    <button class="btn btn-success" id="btnExportarPDF">
        📄 Exportar PDF
    </button>
    <button class="btn btn-success" id="btnExportarXLS">
        📊 Exportar Excel
    </button>
    <button class="btn btn-secondary" id="btnExportarCSV">
        📋 Exportar CSV
    </button>
</div>
```

Adicionar CSS para `.btn-group`:
```css
.btn-group {
    display: flex;
    gap: 0.5rem;
}
```

---

### **3. Criar Funções de Exportação**

Adicionar em `/public/js/app.js` após `exportarConsultaRoteiro()`:

```javascript
// ==================== EXPORTAÇÃO PDF ====================

exportarConsultaRoteiroPDF() {
    const { repositorId } = this.coletarFiltrosConsultaRoteiro();
    if (!repositorId) {
        this.showNotification('Selecione um repositor para exportar.', 'warning');
        return;
    }

    if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
        this.showNotification('Nenhum dado para exportar.', 'warning');
        return;
    }

    const primeiroItem = this.resultadosConsultaRoteiro[0];
    const nomeRepositor = `${primeiroItem.repo_cod} - ${primeiroItem.repo_nome}`;
    const dataAtual = new Date().toLocaleDateString('pt-BR');

    // Organizar por dia da semana
    const diasSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const dadosPorDia = {};

    diasSemana.forEach(dia => {
        dadosPorDia[dia] = this.resultadosConsultaRoteiro
            .filter(item => item.rot_dia_semana === dia)
            .sort((a, b) => {
                const ordemCidadeA = a.rot_ordem_cidade || 999;
                const ordemCidadeB = b.rot_ordem_cidade || 999;
                if (ordemCidadeA !== ordemCidadeB) return ordemCidadeA - ordemCidadeB;

                const ordemVisitaA = a.rot_ordem_visita || 999;
                const ordemVisitaB = b.rot_ordem_visita || 999;
                return ordemVisitaA - ordemVisitaB;
            });
    });

    // Criar PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    // Cabeçalho
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('ROTEIRO DE VISITAS - RS', 14, 20);

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Atualizado em ${dataAtual}`, 14, 27);

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`REPOSITOR: ${nomeRepositor}`, 14, 35);

    // Tabela por dias da semana
    let y = 45;

    diasSemana.forEach(dia => {
        const items = dadosPorDia[dia];
        if (items.length === 0) return;

        const diaLabel = this.formatarDiaSemanaLabel(dia).toUpperCase();

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(diaLabel, 14, y);
        y += 7;

        // Agrupar por cidade
        const cidadesUnicas = [...new Set(items.map(i => i.rot_cidade))];

        cidadesUnicas.forEach(cidade => {
            const clientesCidade = items.filter(i => i.rot_cidade === cidade);

            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(`  ${cidade}`, 14, y);
            y += 5;

            clientesCidade.forEach(item => {
                const cliente = item.cliente_dados || {};
                const fantasia = cliente.fantasia || cliente.nome || '-';
                const linha = `    ${item.rot_cliente_codigo} - ${fantasia}`;

                doc.setFont(undefined, 'normal');
                doc.text(linha, 14, y);
                y += 5;

                if (y > 180) {
                    doc.addPage();
                    y = 20;
                }
            });

            y += 3;
        });

        y += 5;
    });

    // Salvar
    doc.save(`roteiro-${primeiroItem.repo_cod}.pdf`);
    this.showNotification('PDF gerado com sucesso!', 'success');
}

// ==================== EXPORTAÇÃO EXCEL ====================

exportarConsultaRoteiroXLS() {
    const { repositorId } = this.coletarFiltrosConsultaRoteiro();
    if (!repositorId) {
        this.showNotification('Selecione um repositor para exportar.', 'warning');
        return;
    }

    if (!this.resultadosConsultaRoteiro || this.resultadosConsultaRoteiro.length === 0) {
        this.showNotification('Nenhum dado para exportar.', 'warning');
        return;
    }

    const primeiroItem = this.resultadosConsultaRoteiro[0];
    const nomeRepositor = `${primeiroItem.repo_cod} - ${primeiroItem.repo_nome}`;
    const dataAtual = new Date().toLocaleDateString('pt-BR');

    // Organizar dados
    const diasSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const dadosPorDia = {};

    diasSemana.forEach(dia => {
        dadosPorDia[dia] = this.resultadosConsultaRoteiro
            .filter(item => item.rot_dia_semana === dia)
            .sort((a, b) => {
                const ordemCidadeA = a.rot_ordem_cidade || 999;
                const ordemCidadeB = b.rot_ordem_cidade || 999;
                if (ordemCidadeA !== ordemCidadeB) return ordemCidadeA - ordemCidadeB;

                const ordemVisitaA = a.rot_ordem_visita || 999;
                const ordemVisitaB = b.rot_ordem_visita || 999;
                return ordemVisitaA - ordemVisitaB;
            });
    });

    // Criar estrutura do Excel
    const ws_data = [];

    // Cabeçalho
    ws_data.push(['ROTEIRO DE VISITAS - RS']);
    ws_data.push([`Atualizado em ${dataAtual}`]);
    ws_data.push([`REPOSITOR: ${nomeRepositor}`]);
    ws_data.push([]);

    // Dados por dia
    diasSemana.forEach(dia => {
        const items = dadosPorDia[dia];
        if (items.length === 0) return;

        ws_data.push([this.formatarDiaSemanaLabel(dia).toUpperCase()]);

        const cidadesUnicas = [...new Set(items.map(i => i.rot_cidade))];

        cidadesUnicas.forEach(cidade => {
            const clientesCidade = items.filter(i => i.rot_cidade === cidade);

            ws_data.push([`  ${cidade}`]);

            clientesCidade.forEach(item => {
                const cliente = item.cliente_dados || {};
                const fantasia = cliente.fantasia || cliente.nome || '-';
                ws_data.push([`    ${item.rot_cliente_codigo} - ${fantasia}`]);
            });

            ws_data.push([]);
        });

        ws_data.push([]);
    });

    // Criar workbook
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Roteiro");

    // Salvar
    XLSX.writeFile(wb, `roteiro-${primeiroItem.repo_cod}.xlsx`);
    this.showNotification('Excel gerado com sucesso!', 'success');
}
```

---

### **4. Conectar Botões aos Event Listeners**

Em `/public/js/app.js`, na função `inicializarConsultaRoteiro()`:

```javascript
async inicializarConsultaRoteiro() {
    // ... código existente ...

    // Event listeners para exportação
    const btnPDF = document.getElementById('btnExportarPDF');
    const btnXLS = document.getElementById('btnExportarXLS');
    const btnCSV = document.getElementById('btnExportarCSV');

    if (btnPDF) btnPDF.onclick = () => this.exportarConsultaRoteiroPDF();
    if (btnXLS) btnXLS.onclick = () => this.exportarConsultaRoteiroXLS();
    if (btnCSV) btnCSV.onclick = () => this.exportarConsultaRoteiro(); // CSV já existe
}
```

---

### **5. Formato de Saída Desejado**

**PDF e XLS devem gerar:**

```
ROTEIRO DE VISITAS - RS
Atualizado em 05/12/2025

REPOSITOR: 1 - João Silva

SEGUNDA-FEIRA
  Santa Cruz do Sul
    872 - Super Miller (Independência)
    1263 - Imec (Matriz)

  Porto Alegre
    514 - Desco

TERÇA-FEIRA
  Santa Cruz do Sul
    872 - Super Miller (Arroio)
    ...
```

**Com priorização por:**
1. Ordem da cidade (rot_ordem_cidade)
2. Ordem de visita (rot_ordem_visita)

---

## 🚀 Implementação

**Tempo estimado:** 30-45 minutos

**Passos:**
1. Adicionar bibliotecas no index.html
2. Modificar interface (botões)
3. Copiar funções de exportação
4. Conectar event listeners
5. Testar com dados reais

---

## ✅ Checklist Final

- [ ] Bibliotecas adicionadas
- [ ] Botões PDF/XLS criados
- [ ] Função `exportarConsultaRoteiroPDF()` implementada
- [ ] Função `exportarConsultaRoteiroXLS()` implementada
- [ ] Event listeners conectados
- [ ] Testado com repositor real
- [ ] PDF gerado corretamente
- [ ] XLS gerado corretamente

---

**Commit após implementar:**
```bash
git add -A
git commit -m "Implementa exportação PDF e XLS para consulta de roteiro"
git push
```
