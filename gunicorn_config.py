# gunicorn_config.py
import os

# Configuración básica y estable
workers = int(os.environ.get('WEB_CONCURRENCY', 1))
worker_class = 'sync'  # Cambiar a sync para mayor estabilidad
timeout = 120
bind = "0.0.0.0:" + str(os.environ.get('PORT', 10000))

# Logging
accesslog = '-'
errorlog = '-'
loglevel = 'info'

# Sin preload para evitar problemas
preload_app = False
