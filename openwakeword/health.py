import asyncio
import sys

from wyoming.client import AsyncTcpClient
from wyoming.info import Describe, Info


async def check() -> int:
    client = AsyncTcpClient("127.0.0.1", 10400)
    await client.connect()
    try:
        await client.write_event(Describe().event())
        while True:
            event = await client.read_event()
            if event is None:
                return 1
            if Info.is_type(event.type):
                info = Info.from_event(event)
                names = [model.name for program in info.wake for model in program.models]
                return 0 if "hey_jarvis" in names else 1
    finally:
        await client.disconnect()


try:
    sys.exit(asyncio.run(asyncio.wait_for(check(), 5)))
except Exception:
    sys.exit(1)
