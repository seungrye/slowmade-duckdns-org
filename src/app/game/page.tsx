import RoguelikeGame from "@/components/roguelike-game"

export default function GamePage() {
  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-4xl font-bold my-4 dark:text-gray-100">
        Roguelike Adventure
      </h1>
      <RoguelikeGame />
      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">화살표 키를 사용해서 캐릭터(@)를 움직여보세요.</p>
    </div>
  )
}