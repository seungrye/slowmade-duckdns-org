'use client'

import React, { useEffect, useRef } from 'react'
import * as ROT from 'rot-js'

const RoguelikeGame = () => {
  const gameContainerRef = useRef<HTMLDivElement>(null)
  // 컴포넌트 리렌더링 시 상태가 초기화되지 않도록 ref를 사용합니다.
  const playerRef = useRef<{ x: number; y: number } | null>(null)
  const gameMap = useRef<{ [key: string]: string }>({})

  useEffect(() => {
    // 이미 게임이 초기화된 경우 중복 실행을 방지합니다.
    if (
      !gameContainerRef.current ||
      gameContainerRef.current.children.length > 0
    ) {
      return
    }

    const screenWidth = 80
    const screenHeight = 25

    // 1. rot.js Display 초기화
    const display = new ROT.Display({
      width: screenWidth,
      height: screenHeight,
      fontFamily: 'monospace',
      fontSize: 20,
      forceSquareRatio: true,
    })

    // 생성된 canvas를 ref에 연결된 div에 추가합니다.
    gameContainerRef.current.appendChild(display.getContainer()!)

    // 2. 맵 생성 (Digger 알고리즘 사용)
    const digger = new ROT.Map.Digger(screenWidth, screenHeight)
    const freeCells: string[] = []

    digger.create((x, y, value) => {
      // 벽(value=1)이 아닌 곳, 즉 복도와 방(value=0)만 저장합니다.
      if (value) {
        return
      }
      const key = `${x},${y}`
      gameMap.current[key] = "." // 바닥 타일
      freeCells.push(key)
    })

    // 3. 맵과 플레이어 그리기
    const drawMap = () => {
      for (const key in gameMap.current) {
        const parts = key.split(",")
        const x = parseInt(parts[0])
        const y = parseInt(parts[1])
        display.draw(x, y, gameMap.current[key], "#888", "#111")
      }
    }

    const createPlayer = () => {
      const randomIndex = Math.floor(ROT.RNG.getUniform() * freeCells.length)
      const key = freeCells.splice(randomIndex, 1)[0]
      const parts = key.split(",")
      playerRef.current = { x: parseInt(parts[0]), y: parseInt(parts[1]) }
    }

    const drawPlayer = () => {
      if (playerRef.current) {
        display.draw(playerRef.current.x, playerRef.current.y, "@", "#ff0", null)
      }
    }

    const drawGame = () => {
      display.clear()
      drawMap()
      drawPlayer()
    }

    // 초기 플레이어 생성 및 게임 그리기
    createPlayer()
    drawGame()

    // 4. 키보드 입력 처리
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!playerRef.current) return

      const keyMap: { [key: number]: number } = { 38: 0, 39: 1, 40: 2, 37: 3 } // Up, Right, Down, Left
      if (!(event.keyCode in keyMap)) return

      const dir = ROT.DIRS[4][keyMap[event.keyCode]]
      const newX = playerRef.current.x + dir[0]
      const newY = playerRef.current.y + dir[1]

      // 이동하려는 위치가 벽이 아닌지 확인합니다.
      if (!(`${newX},${newY}` in gameMap.current)) return

      playerRef.current = { x: newX, y: newY }
      drawGame()
    }

    window.addEventListener("keydown", handleKeyDown)

    // 컴포넌트가 언마운트될 때 이벤트 리스너를 정리합니다.
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, []) // 빈 의존성 배열로 마운트 시 한 번만 실행되도록 합니다.

  return <div ref={gameContainerRef} className="leading-none border dark:border-gray-700" />
}

export default RoguelikeGame