import sys
import json
import traceback

# List of all 9 video tools with their exact MCP-compliant tool descriptors
TOOLS = [
    {
        "name": "cut_clip",
        "description": "Вырезает затянутые паузы, оговорки и слова-паразиты из timeline.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "start_time": {"type": "number", "description": "Время начала вырезаемого фрагмента в секундах"},
                "end_time": {"type": "number", "description": "Время окончания вырезаемого фрагмента в секундах"}
            },
            "required": ["start_time", "end_time"]
        }
    },
    {
        "name": "add_broll",
        "description": "Вставляет поверх спикера качественное стоковое видео Pexels по теме.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "start_time": {"type": "number", "description": "Начало отображения стокового видео в секундах"},
                "end_time": {"type": "number", "description": "Конец отображения стокового видео в секундах"},
                "query": {"type": "string", "description": "Английский поисковый запрос стока Pexels (например: 'cyberpunk city neon')"}
            },
            "required": ["start_time", "end_time", "query"]
        }
    },
    {
        "name": "create_scene",
        "description": "Создает эффектную инфографику или сплит-экран, используя семантический граф (шаблон, сущности, связи).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "start_time": {"type": "number", "description": "Таймкод начала сцены в секундах"},
                "duration": {"type": "number", "description": "Длительность сцены в секундах"},
                "scene_template": {"type": "string", "description": "Шаблон сцены (например: 'cause_effect', 'timeline', 'comparison', 'concept_explainer')"},
                "mood": {"type": "string", "description": "Настроение сцены (например: 'analytical', 'energetic', 'dramatic')"},
                "energy": {"type": "number", "description": "Уровень энергии от 0.0 до 1.0"},
                "entities": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Список сущностей. Должен включать id, type, text/asset_id и visual_role"
                },
                "relations": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "Связи между сущностями. Список объектов с полями from, to, type"
                }
            },
            "required": ["start_time", "duration", "scene_template", "entities"]
        }
    },
    {
        "name": "build_kinetic_typography",
        "description": "Настраивает глобальный шрифт, цвет и стиль анимации субтитров.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "font": {"type": "string", "description": "Имя шрифта (например: 'Comfortaa-Bold', 'Montserrat-ExtraBold')"},
                "font_size": {"type": "integer", "description": "Размер шрифта в пикселях"},
                "font_color": {"type": "string", "description": "Цвет шрифта в hex-формате"},
                "use_outline": {"type": "boolean", "description": "Использовать ли темную обводку для читаемости"},
                "animation_style": {"type": "string", "description": "Стиль анимации субтитров (например: 'pop', 'slide_up')"}
            }
        }
    },
    {
        "name": "select_bgm",
        "description": "Ищет и накладывает фоновую музыку из библиотеки на таймлайн.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "asset_query": {"type": "string", "description": "Запрос для поиска фоновой музыки в библиотеке (например: 'lofi', 'trap')"},
                "volume": {"type": "number", "description": "Громкость фоновой дорожки в dB"}
            },
            "required": ["asset_query"]
        }
    },
    {
        "name": "create_zoom",
        "description": "Cinematic наезды и отъезды камеры (zoom_in, zoom_out) для расстановки акцентов.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "start_time": {"type": "number", "description": "Начало наезда камеры в секундах"},
                "end_time": {"type": "number", "description": "Конец наезда камеры в секундах"},
                "type": {"type": "string", "description": "Тип зума: 'zoom_in' или 'zoom_out'"}
            },
            "required": ["start_time", "end_time"]
        }
    },
    {
        "name": "build_transition",
        "description": "Склеивает сцены переходом со звуком (whoosh, glitch).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "start_time": {"type": "number", "description": "Таймкод срабатывания перехода"},
                "transition_type": {"type": "string", "description": "Тип перехода: 'whoosh', 'glitch', 'film'"}
            },
            "required": ["start_time"]
        }
    }
]

def send_response(response: dict):
    """Encodes and writes a single JSON-RPC 2.0 payload to stdout."""
    payload = json.dumps(response, ensure_ascii=False) + "\n"
    sys.stdout.write(payload)
    sys.stdout.flush()

def main():
    """Main stdio reader loop."""
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    sys.stderr.write("🔌 VibeEdit Local MCP Server Started\n")
    sys.stderr.flush()
    
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        
        line_str = line.strip()
        if not line_str:
            continue
        
        try:
            req = json.loads(line_str)
            if not isinstance(req, dict):
                continue
            
            method = req.get("method")
            msg_id = req.get("id")
            
            # 1. Handle initialize request
            if method == "initialize":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "vibedit-local-mcp-server",
                            "version": "1.0.0"
                        }
                    }
                }
                send_response(res)
                
            # 2. Handle initialized notification (no response)
            elif method == "notifications/initialized":
                sys.stderr.write("🔌 Handshake complete. Server fully initialized.\n")
                sys.stderr.flush()
                
            # 3. Handle tools/list request
            elif method == "tools/list":
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": TOOLS
                    }
                }
                send_response(res)
                
            # 4. Handle tools/call execution request
            elif method == "tools/call":
                params = req.get("params", {})
                tool_name = params.get("name")
                args = params.get("arguments", {})
                
                # Verify tool exists in our manifest
                tool_meta = next((t for t in TOOLS if t["name"] == tool_name), None)
                if not tool_meta:
                    res = {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {
                            "code": -32601,
                            "message": f"Tool '{tool_name}' not found."
                        }
                    }
                    send_response(res)
                    continue
                
                # Process the local tool execution: return the structured mutation edit payload
                edit_patch = {
                    "tool": tool_name,
                    "arguments": args
                }
                
                res = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(edit_patch, ensure_ascii=False)
                            }
                        ]
                    }
                }
                send_response(res)
                
            else:
                # Unknown method
                if msg_id is not None:
                    res = {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "error": {
                            "code": -32601,
                            "message": f"Method '{method}' not implemented."
                        }
                    }
                    send_response(res)
                    
        except Exception as e:
            sys.stderr.write(f"❌ Error processing input line: {e}\n{traceback.format_exc()}\n")
            sys.stderr.flush()

if __name__ == "__main__":
    main()
