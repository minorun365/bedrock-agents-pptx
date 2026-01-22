import json
import os
import boto3
import urllib.request
from io import BytesIO
from datetime import datetime
from pptx import Presentation


# Lambdaのメイン関数
def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")

    # イベントから必要な情報を取り出す
    action_group = event.get("actionGroup", "")
    function_name = event.get("function", "")
    parameters = {p["name"]: p["value"] for p in event.get("parameters", [])}

    # 呼び出された機能ごとに処理を分岐
    if function_name == "search-web":
        result = search_web(parameters.get("query", ""))
    elif function_name == "create-pptx":
        result = create_pptx(parameters.get("title", "無題"), parameters.get("content", ""))
    elif function_name == "send-email":
        result = send_email(parameters.get("url", ""))
    else:
        result = {"error": f"Unknown function: {function_name}"}

    # Bedrock Agents用のレスポンス形式で返す
    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": action_group,
            "function": function_name,
            "functionResponse": {
                "responseBody": {
                    "TEXT": {"body": json.dumps(result, ensure_ascii=False)}
                }
            }
        }
    }


# Web検索する関数
def search_web(query: str) -> dict:
    # リクエストボディを作成
    data = json.dumps({
        "api_key": os.environ["TAVILY_API_KEY"],
        "query": query
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=data,
        headers={"Content-Type": "application/json"}
    )

    # Tavily APIを呼び出して結果を整形
    with urllib.request.urlopen(req, timeout=30) as res:
        response = json.loads(res.read().decode("utf-8"))

    results = [
        {"title": r["title"], "url": r["url"], "content": r["content"]}
        for r in response.get("results", [])
    ]
    return {"query": query, "results": results}


# パワポ作成する関数
def create_pptx(title: str, content: str) -> dict:
    prs = Presentation()

    # タイトルスライドを作成
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = title
    slide.placeholders[1].text = f"作成日: {datetime.now().strftime('%Y年%m月%d日')}"

    # コンテンツを空行で分割して、各ブロックをスライドにする
    for slide_content in content.strip().split('\n\n'):
        if not slide_content:
            continue
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        lines = slide_content.split('\n')
        # 1行目をスライドタイトル、2行目以降を本文にする
        slide.shapes.title.text = lines[0].lstrip('- #')
        if len(lines) > 1:
            slide.placeholders[1].text = '\n'.join(line.lstrip('- ') for line in lines[1:])

    # メモリ上に保存してS3にアップロード
    pptx_buffer = BytesIO()
    prs.save(pptx_buffer)
    pptx_buffer.seek(0)

    s3 = boto3.client("s3")
    bucket = os.environ["S3_BUCKET"]
    file_key = f"slide_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pptx"
    s3.upload_fileobj(pptx_buffer, bucket, file_key)

    # ダウンロード用の署名付きURLを生成（1時間有効）
    presigned_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": file_key},
        ExpiresIn=3600
    )
    return {"message": "PowerPoint created successfully", "download_url": presigned_url}


# メール送信する関数
def send_email(url: str) -> dict:
    response = boto3.client("sns").publish(
        TopicArn=os.environ["SNS_TOPIC_ARN"],
        Subject="Bedrock Agentsがパワポを作成しました",
        Message=f"以下のURLからダウンロードできます：\n{url}"
    )
    return {"message": "Email sent successfully", "message_id": response["MessageId"]}
