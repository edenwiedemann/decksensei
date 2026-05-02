interface GamePageProps {
  params: Promise<{ game: string }>;
}

export default async function GamePage({ params }: GamePageProps) {
  const { game } = await params;

  if (!["digimon"].includes(game)) {
    return <p>Jogo não suportado: {game}</p>;
  }

  return null;
}
