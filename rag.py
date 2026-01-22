import streamlit as st
import boto3

# タイトルとサイドバーの表示
st.title("おしえて！ Bedrock")
with st.sidebar:
    knowledge_base_id = st.text_input("ナレッジベースID", placeholder="XXXXXXXXXX")

# Bedrock APIクライアントの作成
client = boto3.client("bedrock-agent-runtime")

# メッセージ送信を待機
if prompt := st.chat_input("メッセージを入力してください"):
    # ユーザーメッセージを表示
    with st.chat_message("user"):
        st.markdown(prompt)

    # Knowledge Baseへのストリーミングクエリ
    with st.chat_message("assistant"):
        response = client.retrieve_and_generate_stream(
            input={"text": prompt},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": knowledge_base_id,
                    "modelArn": "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
                },
            },
        )

        # ストリーミングレスポンスの受け皿を準備
        answer = ""
        citations = []
        text_placeholder = st.empty()
        text_placeholder.status("回答を生成中…")

        # レスポンスを見て、テキストもしくは引用を検出
        for event in response["stream"]:
            if "output" in event:
                chunk = event["output"].get("text", "")
                answer += chunk
                text_placeholder.markdown(answer)

            if "citation" in event:
                for ref in event["citation"].get("retrievedReferences", []):
                    location = ref.get("location", {})
                    if "s3Location" in location:
                        uri = location["s3Location"].get("uri", "")
                        if uri and uri not in citations:
                            citations.append(uri)

        # 引用元があれば表示
        if citations:
            with st.expander("引用元", expanded=True):
                for c in citations:
                    st.write(f"- {c}")
