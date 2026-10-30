# Vellora — site institucional

Site da Vellora: sites institucionais, landing pages, identidade visual e Instagram profissional.
Estrutura e movimento adaptados do template Relay; identidade do guia da marca para o site
(paleta Cobalto e ciano, fonte Inter, logo Vela).

## Estrutura

- `index.html` — página única com todas as seções
- `assets/css/vellora.css` — tokens do guia da marca (`--vl-*`) e estilos (grade em 4 quadros: 1440 / 1024 / 768 / 390)
- `assets/js/site.js` — motor de molas, entradas, seções e janela de contato
- `assets/js/fundo.js` — chamas de canto em WebGL (three.js r0.143.0 via CDN), na placa do hero e nos
  cartões marcados com `data-janela` (cada grupo divide um fundo contínuo)
- `assets/img/` — logo horizontal, Vela (SVG colorida e branca), favicons e posts da Vellora

## Antes de publicar

1. **Contatos:** preencha o bloco `CONTATO` no topo de `assets/js/site.js` (WhatsApp, Instagram, e-mail).
   Sem isso, a janela "Fale com a gente" apenas monta a mensagem para copiar.
2. **Domínio:** troque `og:image` em `index.html` pelo endereço absoluto do domínio final.
3. **Dados que faltam:** tudo que ainda depende de vocês aparece na página com contorno tracejado
   laranja e, no `index.html`, com `class="tbd"`. Preencha (ou confirme o texto sugerido) e apague a
   classe. O console do navegador avisa quantos ainda faltam. São eles:
   - preço inicial e prazo médio de cada serviço e da Marca completa (nos serviços e na dúvida "Quanto custa?");
   - pagamento, mensalidade, domínio e hospedagem, textos e fotos, rodadas de ajuste (nas dúvidas);
   - "Não inclui postagens mensais" (Instagram profissional, em Serviços);
   - "Tudo no seu nome" (Sem surpresas) e "Você envia as fotos" (Processo);
   - tempo de resposta "em até 1 dia útil" (hero e contato).
4. **Quem faz:** a seção (pessoas e depoimentos) está desativada num comentário no `index.html`.
   Reative quando houver fotos e depoimentos reais. O CNPJ saiu do rodapé até existir.
5. **Projetos:** a seção logo depois de `03 SEGMENTOS` mostra sites de clientes no ar. Cada um é um
   `<li class="proj">` com:
   - `assets/video/projeto-*.mp4`: 5 s do site rolando, gravados em 1440 × 900 a 60 fps (H.264, sem som),
     e `projeto-*-720.mp4`, a mesma gravação para telas pequenas;
   - `assets/img/projeto-*-hero.webp` (e `-hero-720.webp`): o 1º quadro do vídeo, mostrado até ele tocar;
   - `assets/img/projeto-*-mobile.webp`: o topo no celular (390 × 844, salvo com 400 px).
   O primeiro (`proj--feat`) ocupa a largura toda. Os links para os sites ficaram de fora por enquanto.

## Rodar localmente

```bash
python .claude/serve.py 5182
```

Depois abra `http://localhost:5182`. O site usa three.js, Lenis e Google Fonts por CDN.
