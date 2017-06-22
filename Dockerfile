FROM nginx

RUN rm -r /etc/nginx/conf.d

COPY config /etc/nginx

RUN mkdir -p /data/www
RUN mkdir -p /data/images
RUN mkdir -p /data/up1

COPY data/www /data/www
COPY data/images /data/images
COPY data/up1 /data/up1