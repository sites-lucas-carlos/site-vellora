# Vellora — site institucional

Site da Vellora: sites institucionais, landing pages, identidade visual e Instagram profissional.
Estrutura e movimento adaptados do template Relay; identidade do guia da marca para o site
(paleta Cobalto e ciano, fonte Inter, logo Vela).

## Estrutura

- `index.html` — página única com todas as seções
- `assets/css/vellora.css` — tokens do guia da marca (`--vl-*`) e estilos (grade em 4 quadros: 1440 / 1024 / 768 / 390)
- `assets/js/site.js` — motor de molas, entradas, seções e janela de contato
- `assets/js/fundo.js` — fundo da página inteira em WebGL: chamas nos cantos (three.js r0.143.0 via CDN)
- `assets/img/` — logo horizontal, Vela (SVG colorida e branca), favicons e posts da Vellora

## Antes de publicar

1. **Contatos:** preencha o bloco `CONTATO` no topo de `assets/js/site.js` (WhatsApp, Instagram, e-mail).
   Sem isso, a janela "Fale com a gente" apenas monta a mensagem para copiar.
2. **Domínio:** troque `og:image` em `index.html` pelo endereço absoluto do domínio final.

## Rodar localmente

```bash
python .claude/serve.py 5182
```

Depois abra `http://localhost:5182`. O site usa three.js, Lenis e Google Fonts por CDN.
