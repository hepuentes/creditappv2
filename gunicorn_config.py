import os

# Configuración de workers
workers = int(os.environ.get('WEB_CONCURRENCY', 2))
worker_class = 'gevent'
worker_connections = 1000
timeout = 120
graceful_timeout = 30
keep_alive = 5
threads = 2

# Reciclaje de workers para evitar memory leaks
max_requests = 500
max_requests_jitter = 100

# Configuración de red
bind = "0.0.0.0:" + str(os.environ.get('PORT', 10000))

# Configuración de logging
accesslog = '-'
errorlog = '-'
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Configuración de preload para mejor rendimiento
preload_app = True
reload = False

# Configuración de memoria
worker_tmp_dir = '/dev/shm'

# Función de configuración adicional
def when_ready(server):
    server.log.info("Servidor listo - CreditApp iniciado correctamente")

def worker_int(worker):
    worker.log.info("Worker recibió INT or QUIT signal")

def pre_fork(server, worker):
    server.log.info("Worker pre-fork")
