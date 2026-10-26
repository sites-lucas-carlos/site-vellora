# Vellora — site institucional

Site da Vellora: sites institucionais, landing pages, identidade visual e Instagram profissional.
Estrutura e movimento adaptados do template Relay; identidade do design system Vellora v1.0.

## Estrutura

- `index.html` — página única com todas as seções
- `assets/css/vellora.css` — tokens do design system e estilos (grade em 4 quadros: 1440 / 1024 / 768 / 390)
- `assets/js/site.js` — motor de molas, entradas, seções e janela de contato
- `assets/js/stream.js` — stream de partículas em WebGL (three.js via CDN)
- `assets/img/` — logos oficiais e posts da Vellora

## Antes de publicar

1. **Contatos:** preencha o bloco `CONTATO` no topo de `assets/js/site.js` (WhatsApp, Instagram, e-mail).
   Sem isso, a janela "Fale com a gente" apenas monta a mensagem para copiar.
2. **Domínio:** troque `og:image` em `index.html` pelo endereço absoluto do domínio final.

## Rodar localmente

```bash
python .claude/serve.py 5182
```

Depois abra `http://localhost:5182`. O site usa three.js, Lenis e Google Fonts por CDN.
