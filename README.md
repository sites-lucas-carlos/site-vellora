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
3. **Dados que faltam:** tudo que ainda depende de vocês aparece na página com contorno tracejado
   laranja e, no `index.html`, com `class="tbd"`. Preencha (ou confirme o texto sugerido) e apague a
   classe. O console do navegador avisa quantos ainda faltam. São eles:
   - preço inicial e prazo médio de cada serviço e da Marca completa (nos serviços e na dúvida "Quanto custa?");
   - pagamento, mensalidade, domínio e hospedagem, textos e fotos, rodadas de ajuste (nas dúvidas);
   - o que o Instagram profissional inclui (gestão mensal ou não), em Serviços e nas dúvidas;
   - "Tudo no seu nome" e "Direto com quem faz" (Por que a Vellora);
   - nome, função, foto e bio de cada pessoa, e os depoimentos (Quem faz);
   - tempo de resposta (contato) e CNPJ (rodapé).
4. **Trabalhos:** com 2 ou 3 casos reais, cada um entra como um `case case--feat` e o bloco
   `05 TRABALHOS` sobe para logo depois de `03 SEGMENTOS` (há um comentário no lugar).

## Rodar localmente

```bash
python .claude/serve.py 5182
```

Depois abra `http://localhost:5182`. O site usa three.js, Lenis e Google Fonts por CDN.
