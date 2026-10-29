# Plano de Segurança de Dados - FolhaPay

## 1. Autenticação e Controle de Acesso

### 1.1. Autenticação JWT
- **Token:** JWT com HS256, expiração de 1 hora
- **Secret:** Armazenado em variável de ambiente `JWT_SECRET` (nunca no código)
- **Fluxo:** Login → token → requisições autenticadas
- **Invalidação:** Token expirado = sessão encerrada automaticamente

### 1.2. Isolamento por Usuário
- Cada usuário tem seu próprio `userId` no MongoDB
- Dados de folha são isolados por `userId` no schema `State`
- Nenhum usuário pode ver dados de outro usuário

### 1.3. Conta Bloqueada
- 5 tentativas de login falhadas → bloqueio por 15 minutos
- Reset automático de tentativas em login bem-sucedido

## 2. Proteção em Trânsito (Network)

### 2.1. HTTPS Obrigatório
- Vercel fornece HTTPS em produção
- Local: HTTP (desenvolvimento)

### 2.2. Headers de Segurança
- **CORS:** Restrito a origens específicas (em desenvolvimento: localhost + produção)
- **Content-Security-Policy:** Presente no index.html
- **X-Content-Type-Options:** nos headers do Express

## 3. Proteção em Repouso (Storage)

### 3.1. Senhas
- Hash com bcrypt (salt de 12 rodadas)
- Nunca armazenadas em texto puro
- Nunca exibidas em logs

### 3.2. Tokens
- Armazenados em `localStorage` (inseguro em comparação com HttpOnly cookies, mas compatível com SPA)
- Token never exposto em URLs
- Interceptor de fetch anexa token apenas em chamadas `/api/`

### 3.3. Dados Locais
- Dados de competência em `localStorage` com prefixo `folhapay_`
- Limpeza automática ao logout
- Nenhum dado sensível em texto puro (valores em memória)

## 4. Prevenção de Vazamento

### 4.1. Rate Limiting
- Limitar tentativas de login por IP
- Bloqueio temporário após excesso de falhas

### 4.2. User Enumeration
- Mensagens genéricas ("Credenciais inválidas") para evitar identificar usuários existentes

### 4.3. Logout Limpa Dados
- Remove token e dados locais do usuário anterior
- Impede que um usuário mude para outro sem logout

## 5. Logs e Monitoramento

### 5.1. Logs de Acesso
- Registra login, logout, falhas
- Timestamp e IP (quando disponível)

### 5.2. Diagnóstico Controlado
- `folhapay:debug` em localStorage ativa logs detalhados
- Desativado por padrão

## 6. Configuração de Ambiente

### 6.1. Arquivos de Configuração
- `.env` contém segredos (na .gitignore)
- `.env.example` mostra apenas placeholders
- Nenhum segredo commitado no repositório

### 6.2. Variáveis de Ambiente
- `MONGODB_URI` - Connection string (com credenciais)
- `JWT_SECRET` - Secret para assinar tokens
- `JWT_EXPIRES_IN` - Tempo de expiração do token

## 7. Recomendações Futuras

### 7.1. Melhorias Imediatas
- [ ] Mover token para HttpOnly cookie
- [ ] Implementar Refresh Token
- [ ] Ativar Rate Limiting no backend
- [ ] Adicionar CSRF protection

### 7.2. Melhorias de Longo Prazo
- [ ] Autenticação multifator (2FA)
- [ ] Auditoria completa de acessos
- [ ] Criptografia em repouso para dados sensíveis
- [ ] Integração com Active Directory / SSO corporativo