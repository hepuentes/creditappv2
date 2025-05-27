# gunicorn_config.py
import os

# Configuración de workers
workers = int(os.environ.get('WEB_CONCURRENCY', 2))  # Permite override desde variables de entorno
worker_class = 'gevent'  # Usar workers asíncronos más eficientes
worker_connections = 1000
timeout = 120  # Timeout para operaciones largas
graceful_timeout = 30  # Tiempo para shutdown graceful
keep_alive = 5
threads = 2  # Threading para mejor manejo de conexiones

# Reciclaje de workers para evitar memory leaks
max_requests = 500  # Aumentado para mejor rendimiento
max_requests_jitter = 100  # Jitter para evitar reciclar todos a la vez

# Configuración de red
bind = "0.0.0.0:" + str(os.environ.get('PORT', 10000))

# Configuración de logging
accesslog = '-'  # Log a stdout
errorlog = '-'   # Error log a stderr
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Configuración de preload para mejor rendimiento
preload_app = True  # Precargar la aplicación
reload = False  # No usar reload en producción

# Configuración de memoria
worker_tmp_dir = '/dev/shm'  # Usar memoria compartida si está disponible

# Función de configuración adicional
def when_ready(server):
    server.log.info("Servidor listo - CreditApp iniciado correctamente")

def worker_int(worker):
    worker.log.info("Worker recibió INT o QUIT signal")

def pre_fork(server, worker):
    server.log.info("Worker pre-fork")
