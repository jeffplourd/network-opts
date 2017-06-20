FROM nginx

RUN rm -r /etc/nginx/conf.d

COPY config /etc/nginx