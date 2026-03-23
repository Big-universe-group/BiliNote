import queue
import threading
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


class TaskQueue:
    """
    单 Worker 线程队列：所有任务 FIFO 串行执行。
    与 SerialTaskExecutor 的本质区别：
    - 只有一个 Worker 线程，永远不会有第二个线程在等锁
    - 请求线程 submit() 后立即返回，不阻塞
    - 彻底避免多线程竞争导致的 OOM
    """

    def __init__(self):
        self._queue: queue.Queue = queue.Queue()
        self._worker = threading.Thread(target=self._run, daemon=True, name="note-worker")
        self._worker.start()
        logger.info("TaskQueue worker thread started")

    def _run(self):
        while True:
            fn, args, kwargs = self._queue.get()
            try:
                fn(*args, **kwargs)
            except Exception as e:
                logger.error(f"TaskQueue worker 执行异常: {e}", exc_info=True)
            finally:
                self._queue.task_done()

    def submit(self, fn: Callable[..., Any], *args: Any, **kwargs: Any):
        self._queue.put((fn, args, kwargs))
        logger.info(f"任务已入队，当前队列长度: {self._queue.qsize()}")


task_queue = TaskQueue()
