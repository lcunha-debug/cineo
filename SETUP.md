# Cineo — Setup

## Requisitos

- **Node.js 18+** — baixe em https://nodejs.org (versão LTS)

## Instalar e rodar

```bash
# 1. Instalar dependências
npm install

# 2. Rodar em modo de desenvolvimento
npm run dev

# 3. Build para distribuição (opcional)
npm run dist
```

## Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| Importar Mídia | Vídeo, áudio e imagens via painel lateral |
| Timeline | Arraste clips, redimensione, mova entre faixas |
| Preview | Player com play/pause, scrubber, salto de 5s |
| Auto-Corte IA | Detecta silêncio e sinais de palma, aplica cortes automaticamente |
| Exportar | Renderiza via FFmpeg (alta/média/baixa qualidade) |

## Atalhos

| Tecla | Ação |
|---|---|
| `Espaço` | Play / Pause |
| `Delete` | Remove clip selecionado |
| Double-click no painel | Adiciona clip ao final da timeline |
| Drag & drop | Arraste mídia para a timeline |

## Auto-Corte IA

1. Importe um vídeo com áudio
2. Adicione na timeline
3. Abra o painel "Auto-Corte IA" (lado direito)
4. Ajuste os parâmetros (threshold de silêncio, duração mínima, etc.)
5. Clique em **Analisar e Cortar**
6. Revise os segmentos detectados
7. Clique em **Aplicar Cortes na Timeline**

O algoritmo detecta:
- **Silêncio**: partes sem áudio (abaixo do threshold de amplitude)
- **Sinal de corte (palma)**: pico repentino de áudio → marca um ponto de corte
