import { useState, useRef, useEffect, useCallback } from 'react'
import { Authenticator } from '@aws-amplify/ui-react'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime'
import '@aws-amplify/ui-react/styles.css'
import './App.css'

// 環境変数から設定を取得
const AGENT_ID = import.meta.env.VITE_AGENT_ID
const AGENT_ALIAS_ID = import.meta.env.VITE_AGENT_ALIAS_ID
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1'

// 型定義
interface Message {
  role: 'user' | 'assistant' | 'trace'
  content: string
  traceType?: 'thinking' | 'action'
}

// Lambda関数名をユーザーフレンドリーな日本語に変換
const getFunctionDisplayName = (functionName: string): string => {
  const functionMap: Record<string, string> = {
    'search-web': 'Web検索',
    'search-knowledge-base': 'ナレッジベース検索',
    'create-pptx': 'スライド作成',
    'send-email': 'メール送信',
  }
  return functionMap[functionName] || functionName
}

// アクションのパラメータから表示用の概要を抽出
const getParameterSummary = (params: Array<{ name: string; value: string }>): string => {
  if (!params || params.length === 0) return ''

  const queryParam = params.find(p => p.name === 'query')
  if (queryParam) {
    return `「${queryParam.value}」`
  }

  const firstParam = params[0]
  if (firstParam) {
    return `${firstParam.name}: ${firstParam.value}`
  }

  return ''
}

// メインコンポーネント
function App() {
  // State
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [renderKey, setRenderKey] = useState(0)

  // Refs
  const sessionIdRef = useRef(crypto.randomUUID())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])

  // 新しいメッセージが追加されたら自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [renderKey, streamingText])

  // メッセージを追加して再レンダリングをトリガー（useRefでストリーミング中の消失を防止）
  const addMessage = useCallback((message: Message) => {
    messagesRef.current.push(message)
    setRenderKey(prev => prev + 1)
  }, [])

  // Bedrock Agentのトレース情報をパースしてメッセージとして追加
  const addTraceMessage = (trace: unknown) => {
    if (!trace || typeof trace !== 'object') return
    const t = trace as Record<string, unknown>

    if (!t.orchestrationTrace) return
    const ot = t.orchestrationTrace as Record<string, unknown>

    // エージェントの思考（rationale）を表示
    if (ot.rationale) {
      const rationale = ot.rationale as Record<string, unknown>
      const text = String(rationale.text || '')
      if (text) {
        addMessage({ role: 'trace', content: text, traceType: 'thinking' })
      }
    }

    // アクション（Lambda関数）実行時の情報を表示
    if (ot.invocationInput) {
      const input = ot.invocationInput as Record<string, unknown>
      const actionGroup = input.actionGroupInvocationInput as Record<string, unknown> | undefined

      if (actionGroup) {
        const functionName = String(actionGroup.function || '')
        const params = actionGroup.parameters as Array<{ name: string; value: string }> | undefined
        const displayName = getFunctionDisplayName(functionName)

        // send-emailはURLが長いためパラメータを表示しない
        const paramSummary = functionName === 'send-email'
          ? ''
          : (params ? getParameterSummary(params) : '')

        const content = paramSummary
          ? `${displayName}を実行しています ${paramSummary}`
          : `${displayName}を実行しています`

        addMessage({ role: 'trace', content, traceType: 'action' })
      }
    }
  }

  // Bedrock Agent を呼び出し
  const invokeAgent = async (prompt: string) => {
    setIsLoading(true)
    setStreamingText('')
    addMessage({ role: 'user', content: prompt })

    try {
      // Cognito認証情報を取得
      const { credentials } = await fetchAuthSession()
      if (!credentials) {
        throw new Error('認証情報を取得できませんでした')
      }

      // Bedrock Agent クライアントを作成
      const client = new BedrockAgentRuntimeClient({
        region: AWS_REGION,
        credentials,
      })

      // エージェント呼び出しコマンドを作成
      const command = new InvokeAgentCommand({
        agentId: AGENT_ID,
        agentAliasId: AGENT_ALIAS_ID,
        sessionId: sessionIdRef.current,
        inputText: prompt,
        enableTrace: true,
      })

      const response = await client.send(command)
      if (!response.completion) {
        throw new Error('レスポンスがありません')
      }

      // ストリーミングレスポンスを処理
      let fullResponse = ''
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          const text = new TextDecoder('utf-8').decode(event.chunk.bytes)
          fullResponse += text
          setStreamingText(fullResponse)
        }
        if (event.trace?.trace) {
          addTraceMessage(event.trace.trace)
        }
      }

      // 最終応答をメッセージに追加
      addMessage({ role: 'assistant', content: fullResponse })
      setStreamingText('')

    } catch (err) {
      console.error('Agent invocation error:', err)
      const errorMessage = err instanceof Error ? err.message : 'エラーが発生しました'
      addMessage({ role: 'assistant', content: `エラー: ${errorMessage}` })
    } finally {
      setIsLoading(false)
    }
  }

  // フォーム送信ハンドラ
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || isLoading) return
    invokeAgent(inputText.trim())
    setInputText('')
  }

  // メッセージのCSSクラスを決定
  const getMessageClassName = (msg: Message): string => {
    const baseClass = msg.role === 'trace' ? 'assistant' : msg.role
    const actionClass = msg.traceType === 'action' ? 'trace-action' : ''
    return `message ${baseClass} ${actionClass}`.trim()
  }

  // 「考え中…」表示の条件判定
  const shouldShowThinking = (): boolean => {
    if (!isLoading || streamingText) return false
    if (messagesRef.current.length === 0) return false
    return messagesRef.current[messagesRef.current.length - 1]?.role !== 'trace'
  }

  return (
    <Authenticator>
      {({ signOut }) => (
        <div className="app-container">
          {/* ヘッダー */}
          <header className="header">
            <h1>パワポ作ってメールで送るマン</h1>
            <button onClick={signOut} className="logout-btn">
              ログアウト
            </button>
          </header>

          {/* チャットエリア */}
          <div className="chat-area">
            <div className="messages">
              {/* ウェルカムメッセージ */}
              {messagesRef.current.length === 0 && (
                <div className="welcome-message">
                  <p>Bedrock Agentsに資料作成をまかせよう！</p>
                </div>
              )}

              {/* メッセージ一覧 */}
              {messagesRef.current.map((msg, idx) => (
                <div key={idx} className={getMessageClassName(msg)}>
                  <div className="message-content">{msg.content}</div>
                </div>
              ))}

              {/* ストリーミング中のテキスト */}
              {streamingText && (
                <div className="message assistant">
                  <div className="message-content">{streamingText}</div>
                </div>
              )}

              {/* 考え中の表示 */}
              {shouldShowThinking() && (
                <div className="message assistant">
                  <div className="message-content">考え中…</div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 入力フォーム（全幅背景） */}
          <form onSubmit={handleSubmit} className="input-form">
            <div className="input-form-inner">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="例：「KAGのみのるんについてパワポにまとめて」"
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading || !inputText.trim()}>
                送信
              </button>
            </div>
          </form>
        </div>
      )}
    </Authenticator>
  )
}

export default App
