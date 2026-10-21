'use client';
import { useAuth } from '@/contexts/auth-context';

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="text-muted-foreground">{children}</p>
    </section>
  );
}

export default function PrivacidadePage() {
  const { user } = useAuth();
  const empresa = (user as any)?.empresa_nome || 'a empresa contratante';

  return (
    <div className="mx-auto max-w-2xl space-y-5 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Política de privacidade</h1>
      <p className="text-muted-foreground">Uso interno. Vigente para todos os funcionários com acesso ao sistema.</p>

      <Secao titulo="Quem é quem">
        A <b>{empresa}</b> é a controladora dos dados: define para que servem e quem pode vê-los.
        A <b>Aurox</b> é a operadora: mantém o sistema, hospeda e trata os dados somente para prestar o serviço contratado.
        O funcionário é usuário autorizado, não titular dos dados dos clientes.
      </Secao>

      <Secao titulo="O que é tratado">
        Dados de clientes e leads (nome, telefone, CPF, endereço, dados de crédito e de veículo), dados de operação
        (estoque, oficina, faturamento, fichas) e dados do próprio funcionário (login, perfil, loja, telefone, e-mail e
        foto, quando informados).
      </Secao>

      <Secao titulo="Para que serve">
        Conduzir a venda, analisar crédito, controlar estoque e oficina, emitir faturamento e medir o desempenho da
        equipe. Nada além da operação da loja.
      </Secao>

      <Secao titulo="Quem vê o quê">
        O acesso é limitado pelo cargo. Vendedor vê os próprios leads. Gerente vê a loja dele. Perfis administrativos
        e de oficina veem apenas o que a função exige. Dado de outro vendedor, de outra loja ou de área restrita
        não é de acesso livre.
      </Secao>

      <Secao titulo="Sigilo">
        É vedado copiar, fotografar, encaminhar ou comentar fora do sistema dados de cliente, de crédito, de venda
        ou de colega. O acesso é pessoal e intransferível. Senha não se empresta. Uso em nome de outro funcionário
        é falta.
      </Secao>

      <Secao titulo="Segurança">
        Conexão protegida, autenticação por conta individual, separação por perfil e armazenamento em provedor
        com controle de acesso. Arquivos operacionais ficam no armazenamento do sistema, não em aparelho
        pessoal.
      </Secao>

      <Secao titulo="Por quanto tempo">
        Os dados permanecem enquanto forem necessários à operação, à cobrança, à garantia e às obrigações
        legais da {empresa}. Depois disso, são eliminados ou anonimizados.
      </Secao>

      <Secao titulo="Direitos e dúvidas">
        Pedido de acesso, correção ou exclusão de dado pessoal é feito à {empresa}, que é a controladora. A
        Aurox atende a loja, não o cliente final nem o funcionário em nome próprio.
      </Secao>

      <p className="text-muted-foreground">
        Esta política segue a Lei Geral de Proteção de Dados (Lei 13.709/2018). O uso do sistema implica ciência e
        aceite destas regras.
      </p>
    </div>
  );
}
