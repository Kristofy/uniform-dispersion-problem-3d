FROM ubuntu:24.04

# Install dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y \
    python3 git wget xz-utils clang make llvm lld ripgrep vim

USER ubuntu
WORKDIR /home/ubuntu
RUN wget https://nodejs.org/dist/v22.15.0/node-v22.15.0-linux-x64.tar.xz && \
    tar -xf node-v22.15.0-linux-x64.tar.xz && \
    mv node-v22.15.0-linux-x64 nodejs
ENV PATH="/home/ubuntu/nodejs/bin:${PATH}"

CMD ["/usr/bin/sleep", "infinity"]