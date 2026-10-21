'use client';
import { useAuth } from '@/contexts/auth-context';

export default function SobrePage() {
  const { user } = useAuth();
  const empresa = (user as any)?.empresa_nome || 'sua empresa';

  return (
    <div className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">Sobre nós</h1>

      <p>
        A <b>Aurox</b> desenvolve sistemas de operação para o varejo automotivo.
        O que você usa aqui foi feito para a <b>{empresa}</b>: um ambiente único
        onde lead, ficha, estoque, oficina e faturamento andam juntos, com cada pessoa
        vendo só o que o cargo permite.
      </p>

      <p>
        Não somos a loja. Somos quem constrói a ferramenta. A <b>{empresa}</b> é a
        contratante e a responsável pelos dados dos clientes. Os funcionários usam o
        sistema a serviço dela, dentro das funções definidas.
      </p>

      <h2 className="text-lg font-semibold">Como trabalhamos</h2>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Acesso por cargo. Vendedor, gerente, administrativo, oficina e os demais perfis enxergam recortes diferentes.</li>
        <li>Registro do que importa. Lead, ficha, venda e movimentação ficam rastreáveis.</li>
        <li>Sigilo como regra. Dado de cliente não é assunto de conversa fora do sistema.</li>
        <li>Evolução contínua. O sistema cresce com a operação, sem improvisar planilha paralela.</li>
      </ul>

      <p className="text-muted-foreground">
        Aurox Sistemas · ferramenta de uso interno da {empresa}.
      </p>
    </div>
  );
}
